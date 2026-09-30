/**
 * Reading a flight off a boarding pass, e-ticket, or booking screenshot.
 *
 * The anchors form already accepts manual entry and will keep it: a screenshot
 * can be unreadable, and a flight is the one thing on a trip that cannot be
 * approximately right. What the upload removes is the usual case, where the
 * confirmation is already sitting in the traveller's photos.
 *
 * A parsed flight fills the *draft*, not the saved anchors. The traveller sees
 * what was read and confirms it. Writing straight through would mean a
 * misread departure time silently becoming the time they leave for the airport.
 */

import { FlightAnchor } from '../types';

export const FLIGHT_MODEL = 'gemini-3-flash-preview';

export interface ParsedFlight {
  direction?: 'OUTBOUND' | 'RETURN';
  flightNumber?: string;
  departureAirport?: string;
  departureAirportIata?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalAirport?: string;
  arrivalAirportIata?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  isUncertain?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const IATA = /^[A-Z]{3}$/;

const cleanTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().replace('：', ':').match(CLOCK);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
};

const cleanIata = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const code = value.trim().toUpperCase();
  return IATA.test(code) ? code : undefined;
};

const cleanText = (value: unknown, limit: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, limit) : undefined;
};

/**
 * A flight with no departure date and time is not an anchor — the whole point
 * of an anchor is to fix a moment the rest of the day is arranged around. It
 * is refused rather than half-filled.
 */
export const normalizeParsedFlight = (raw: unknown): ParsedFlight | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  const departureDate = typeof value.departureDate === 'string' && ISO_DATE.test(value.departureDate.trim())
    ? value.departureDate.trim() : undefined;
  const departureTime = cleanTime(value.departureTime);
  if (!departureDate || !departureTime) return null;

  const flight: ParsedFlight = { departureDate, departureTime };

  if (value.direction === 'OUTBOUND' || value.direction === 'RETURN') flight.direction = value.direction;

  flight.flightNumber = cleanText(value.flightNumber, 12);
  flight.departureAirport = cleanText(value.departureAirport, 80);
  flight.departureAirportIata = cleanIata(value.departureAirportIata);
  flight.arrivalAirport = cleanText(value.arrivalAirport, 80);
  flight.arrivalAirportIata = cleanIata(value.arrivalAirportIata);
  flight.arrivalTime = cleanTime(value.arrivalTime);

  const arrivalDate = typeof value.arrivalDate === 'string' && ISO_DATE.test(value.arrivalDate.trim())
    ? value.arrivalDate.trim() : undefined;
  // Landing before take-off is a misread, not a timezone. An overnight flight
  // arrives the next day, which is later, so this only catches genuine errors.
  if (arrivalDate && arrivalDate < departureDate) {
    flight.isUncertain = true;
  } else if (arrivalDate) {
    flight.arrivalDate = arrivalDate;
  }

  // A departure airport we cannot name leaves the anchor unusable, so say so
  // rather than presenting a confident-looking half result.
  if (!flight.departureAirport && !flight.departureAirportIata) flight.isUncertain = true;
  if (value.isUncertain === true) flight.isUncertain = true;

  for (const key of Object.keys(flight) as Array<keyof ParsedFlight>) {
    if (flight[key] === undefined) delete flight[key];
  }
  return flight;
};

/**
 * Every flight readable from one image, assigned to a leg.
 *
 * A round-trip booking shows both legs on the same screen. Parsing only the
 * first left the return empty and the traveller assuming the upload had
 * half-worked — which is exactly what it had done.
 *
 * Assignment prefers what the model said, then falls back to chronology: with
 * two flights, the earlier departure is the outbound. Only the first flight
 * per leg is kept, so a connecting itinerary fills the leg from its first
 * segment rather than overwriting it with the second.
 */
export const assignFlightsToLegs = (
  raw: unknown,
): { OUTBOUND?: ParsedFlight; RETURN?: ParsedFlight } => {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { flights?: unknown })?.flights)
      ? (raw as { flights: unknown[] }).flights
      : [raw];

  const flights = list
    .map(normalizeParsedFlight)
    .filter((flight): flight is ParsedFlight => flight !== null)
    .sort((a, b) =>
      `${a.departureDate} ${a.departureTime}`.localeCompare(`${b.departureDate} ${b.departureTime}`),
    );

  const legs: { OUTBOUND?: ParsedFlight; RETURN?: ParsedFlight } = {};
  for (const [index, flight] of flights.entries()) {
    // Chronological fallback only applies when there are exactly two flights;
    // with three or more the order is a connection, not an out-and-back.
    const inferred = flights.length === 2 && index === 1 ? 'RETURN' : 'OUTBOUND';
    const leg = flight.direction ?? inferred;
    if (!legs[leg]) legs[leg] = flight;
  }
  return legs;
};

export const flightPrompt = (tripStartDate?: string, tripEndDate?: string) => `
      Analyze this image. It is a boarding pass, e-ticket, or flight booking
      confirmation.

      It may show MORE THAN ONE flight. A round-trip booking normally shows the
      outbound and the return together, and a journey may have connections.
      Return every distinct flight you can see, in the "flights" array.

      Extract:
      1. "flightNumber": e.g. "BR170".
      2. "departureAirport": the airport name as written, and
         "departureAirportIata": its 3-letter IATA code.
      3. "arrivalAirport" and "arrivalAirportIata": the same for the destination.
      4. "departureDate" (YYYY-MM-DD) and "departureTime" (HH:mm, 24-hour),
         in the departure airport's own local time.
      5. "arrivalDate" and "arrivalTime", in the arrival airport's local time,
         only if the image shows them.
      6. "direction": "OUTBOUND" if this flight leaves for the destination,
         "RETURN" if it comes back.${
        tripStartDate && tripEndDate
          ? ` The trip runs ${tripStartDate} to ${tripEndDate}; a flight on or
         near the first date is OUTBOUND, one near the last is RETURN.`
          : ''
      }

      Rules:
      - Return only what the image shows. Omit anything it does not.
      - Never convert times between timezones; report each as printed.
      - One entry per flight. Do not repeat the same flight twice.
      - If only one flight is shown, return an array of one.
      - Set "isUncertain" to true if the image is blurry, cropped, or ambiguous.

      Return JSON shaped { "flights": [ ... ] }.
    `;

/**
 * Folds a parsed flight into the anchor draft the form is showing.
 *
 * Only fields the screenshot actually supplied are written, so a partial read
 * tops up the draft instead of blanking what the traveller already typed.
 */
export const applyFlightToDraft = (
  draft: FlightAnchor[],
  flight: ParsedFlight,
  direction: 'OUTBOUND' | 'RETURN',
): FlightAnchor[] =>
  draft.map(anchor => {
    if (anchor.direction !== direction) return anchor;
    const next = { ...anchor };
    if (flight.departureDate) next.departureDate = flight.departureDate;
    if (flight.departureTime) next.departureTime = flight.departureTime;
    if (flight.departureAirport) next.departureAirport = flight.departureAirport;
    if (flight.departureAirportIata) next.departureAirportIata = flight.departureAirportIata;
    if (flight.arrivalAirport) next.arrivalAirport = flight.arrivalAirport;
    if (flight.arrivalAirportIata) next.arrivalAirportIata = flight.arrivalAirportIata;
    if (flight.arrivalDate) next.arrivalDate = flight.arrivalDate;
    if (flight.arrivalTime) next.arrivalTime = flight.arrivalTime;
    return next;
  });
