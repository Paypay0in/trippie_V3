import { FlightAirport, FlightAnchor, TripFlightMode } from '../types';
import { airportCandidatesForCity, findAirportByIata } from './airportDirectory';

export interface FlightSetupContext {
  destination?: string;
  startDate?: string;
  endDate?: string;
  /** Explicit home/origin airport, e.g. from profile or imported booking data. */
  homeAirportIata?: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `anchor-${Math.random().toString(36).slice(2)}-${Date.now()}`;

const blankAnchor = (direction: FlightAnchor['direction']): FlightAnchor => ({
  id: newId(),
  direction,
  departureDate: '',
  departureTime: '',
  departureAirport: '',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
});

/** Write a canonical airport onto one side of an anchor. Clears it when undefined. */
export const applyAirport = (
  anchor: FlightAnchor,
  side: 'departure' | 'arrival',
  airport: FlightAirport | undefined,
): FlightAnchor => {
  if (side === 'departure') {
    return {
      ...anchor,
      departureAirport: airport ? airport.name : '',
      departureAirportIata: airport?.iataCode,
      departureAirportCity: airport?.city,
      departureAirportCountry: airport?.country,
      departureAirportLatitude: airport?.latitude,
      departureAirportLongitude: airport?.longitude,
    };
  }
  return {
    ...anchor,
    arrivalAirport: airport ? airport.name : undefined,
    arrivalAirportIata: airport?.iataCode,
    arrivalAirportCity: airport?.city,
    arrivalAirportCountry: airport?.country,
    arrivalAirportLatitude: airport?.latitude,
    arrivalAirportLongitude: airport?.longitude,
  };
};

export const airportOf = (
  anchor: FlightAnchor,
  side: 'departure' | 'arrival',
): FlightAirport | undefined => {
  const iata = side === 'departure' ? anchor.departureAirportIata : anchor.arrivalAirportIata;
  return iata ? findAirportByIata(iata) : undefined;
};

/**
 * Build the editable pair for a trip: exactly one outbound and, for a round
 * trip, exactly one return. Existing anchors are reused (never recreated), so
 * saved data survives; only genuinely missing legs are seeded.
 *
 * Prefills are conveniences and never lock a field:
 *  - dates from the trip range
 *  - arrival airport from the destination, but only when the destination city
 *    has a single obvious airport
 *  - origin from an explicit home airport, never from device location
 *  - the return leg mirrors the outbound pair
 */
export const buildFlightAnchorDraft = (
  existing: FlightAnchor[],
  context: FlightSetupContext,
  mode: TripFlightMode = 'ROUND_TRIP',
): FlightAnchor[] => {
  const pick = (direction: FlightAnchor['direction']) =>
    existing.find(anchor => anchor.direction === direction);

  let outbound = pick('OUTBOUND') ? { ...pick('OUTBOUND')! } : blankAnchor('OUTBOUND');
  if (!outbound.departureDate && context.startDate) outbound.departureDate = context.startDate;

  const home = context.homeAirportIata ? findAirportByIata(context.homeAirportIata) : undefined;
  if (!outbound.departureAirportIata && !outbound.departureAirport && home) {
    outbound = applyAirport(outbound, 'departure', home);
  }

  const destination = airportCandidatesForCity(context.destination || '');
  if (!outbound.arrivalAirportIata && !outbound.arrivalAirport && destination.primary) {
    outbound = applyAirport(outbound, 'arrival', destination.primary);
  }

  if (mode === 'ONE_WAY') return [outbound];

  let ret = pick('RETURN') ? { ...pick('RETURN')! } : blankAnchor('RETURN');
  if (!ret.departureDate && context.endDate) ret.departureDate = context.endDate;

  const outboundArrival = airportOf(outbound, 'arrival');
  const outboundDeparture = airportOf(outbound, 'departure');
  if (!ret.departureAirportIata && !ret.departureAirport && outboundArrival) {
    ret = applyAirport(ret, 'departure', outboundArrival);
  }
  if (!ret.arrivalAirportIata && !ret.arrivalAirport && outboundDeparture) {
    ret = applyAirport(ret, 'arrival', outboundDeparture);
  }

  return [outbound, ret];
};

/**
 * Candidate arrival airports for the trip destination, for the case where the
 * city has several plausible airports and the user must choose.
 */
export const destinationAirportCandidates = (destination: string | undefined): FlightAirport[] =>
  airportCandidatesForCity(destination || '').candidates;

export interface FlightAnchorFieldError {
  anchorId: string;
  direction: FlightAnchor['direction'];
  field: 'departureDate' | 'departureTime' | 'departureAirport' | 'arrivalAirport';
  message: string;
}

const LEG_LABEL: Record<FlightAnchor['direction'], string> = {
  OUTBOUND: '去程',
  RETURN: '回程',
};

/**
 * Field-level validation. Every message names the exact leg and field that is
 * missing, so the user never has to guess which card is incomplete.
 */
export const validateFlightAnchors = (anchors: FlightAnchor[]): FlightAnchorFieldError[] => {
  const errors: FlightAnchorFieldError[] = [];
  anchors.forEach(anchor => {
    const leg = LEG_LABEL[anchor.direction];
    const push = (field: FlightAnchorFieldError['field'], message: string) =>
      errors.push({ anchorId: anchor.id, direction: anchor.direction, field, message });
    if (!anchor.departureDate) push('departureDate', `請選擇${leg}出發日期`);
    if (!anchor.departureTime) push('departureTime', `請選擇${leg}出發時間`);
    if (!anchor.departureAirport.trim()) push('departureAirport', `請選擇${leg}出發機場`);
    if (!anchor.arrivalAirport?.trim()) push('arrivalAirport', `請選擇${leg}抵達機場`);
  });
  return errors;
};

/**
 * Parse loose user input into the canonical `HH:mm`.
 *
 * Safari on macOS renders `<input type="time">` but, for a React-controlled
 * field, never fires input/change and keeps `.value` as '' — the widget shows
 * 12:30 while the element reports nothing. The flight form therefore drives a
 * plain text field through this parser instead of trusting the native control.
 *
 * Returns the canonical value, or undefined while the entry is still partial.
 */
export const parseTimeInput = (raw: string): string | undefined => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 4) return undefined;
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (!Number.isInteger(hours) || hours > 23) return undefined;
  if (!Number.isInteger(minutes) || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** What the user sees while typing: digits grouped as HH:MM, nothing invented. */
export const formatTimeInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};
