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
import { findAirportByIata } from './airportDirectory';
import { applyAirport } from './flightAnchorSetup';

export const FLIGHT_MODEL = 'gemini-3-flash-preview';

export interface ParsedFlight {
  direction?: 'OUTBOUND' | 'RETURN';
  flightNumber?: string;
  departureAirport?: string;
  departureAirportIata?: string;
  departureDate?: string;
  /**
   * The weekday beside the date, exactly as printed.
   *
   * 「我傳機票資訊 結果日期不正確」 — the ticket said 「10 月 20 日（二）」 and no
   * year, and the read came back 2023-10-20, which was a Friday. The weekday
   * was on the page the whole time and is enough to pin the year on its own:
   * 10/20 falls on a Tuesday once every five or six years.
   */
  departureWeekday?: string;
  departureTime?: string;
  arrivalAirport?: string;
  arrivalAirportIata?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  isUncertain?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEARLESS_DATE = /^(\d{1,2})-(\d{1,2})$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const IATA = /^[A-Z]{3}$/;

/**
 * A date off a ticket, with the year separated from the day it fell on.
 *
 * 「這張航班時間如此明確 為何一直說讀不出來」 — and it was. The ticket printed
 * 「10 月 20 日（二）· 6:35」 and the read came back `"10-20"`, which the old
 * check rejected outright, so both legs came back empty and the traveller was
 * told the screenshot was unreadable.
 *
 * This was self-inflicted. The prompt was told not to fall back on a year it
 * had seen in training data — the repair for 「我傳機票資訊 結果日期不正確」 — and
 * it obeyed by printing no year at all, which nothing downstream accepted. A
 * yearless date is the honest answer most confirmations support, so it is read
 * as one rather than thrown away.
 */
const readTicketDate = (value: unknown): { monthDay: string; year?: number } | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (ISO_DATE.test(text)) return { monthDay: text.slice(5), year: Number(text.slice(0, 4)) };
  const yearless = text.match(YEARLESS_DATE);
  return yearless
    ? { monthDay: `${yearless[1].padStart(2, '0')}-${yearless[2].padStart(2, '0')}` }
    : undefined;
};

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
/**
 * The weekday a ticket prints, as a day index, or undefined.
 *
 * Chinese 「（二）」 and English 「Tue」 are the two forms these confirmations use;
 * anything else is read as nothing rather than guessed at, because a wrong
 * weekday would move a correct date by years.
 */
const WEEKDAY_INDEX: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export const weekdayIndex = (printed: string | undefined): number | undefined => {
  const raw = (printed || '').trim();
  if (!raw) return undefined;

  const chinese = raw.match(/[日天一二三四五六]/);
  if (chinese) return WEEKDAY_INDEX[chinese[0]];

  const english = raw.toLowerCase().slice(0, 3);
  return english in WEEKDAY_INDEX ? WEEKDAY_INDEX[english] : undefined;
};

/**
 * The year the ticket meant, when the weekday says the read one is wrong.
 *
 * 「我傳機票資訊 結果日期不正確」. A confirmation that prints 「10 月 20 日（二）」
 * and no year leaves the model to pick one, and it picked 2023 — a Friday.
 * The weekday is evidence we already had on the page, and the month and day
 * only land on a given weekday once every five or six years, so it names the
 * year outright.
 *
 * Searched outward from the read year so the nearest match wins, and only
 * within five years: beyond that a disagreeing weekday is more likely a
 * misread character than a date six years away.
 *
 * Returns the date unchanged when there is no weekday, when it cannot be
 * read, or when nothing nearby agrees — a repair nobody can justify is worse
 * than the original, which at least came off the page.
 */
export const yearFromWeekday = (isoDate: string, printedWeekday?: string): string => {
  const wanted = weekdayIndex(printedWeekday);
  if (wanted === undefined || !ISO_DATE.test(isoDate)) return isoDate;

  const [year, month, day] = isoDate.split('-').map(Number);
  const asRead = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(asRead.getTime())) return isoDate;
  if (asRead.getUTCDay() === wanted) return isoDate;

  for (let delta = 1; delta <= 5; delta += 1) {
    for (const candidateYear of [year + delta, year - delta]) {
      const candidate = new Date(Date.UTC(candidateYear, month - 1, day));
      if (candidate.getUTCMonth() !== month - 1) continue; // 2/29 in a common year
      if (candidate.getUTCDay() === wanted) {
        return `${candidateYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  return isoDate;
};

export const normalizeParsedFlight = (raw: unknown): ParsedFlight | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  const read = readTicketDate(value.departureDate);
  const departureTime = cleanTime(value.departureTime);
  if (!read || !departureTime) return null;

  /*
    A ticket that prints no year is read against this one, then checked by the
    weekday like any other. Today's year is a starting point, not an answer:
    `yearFromWeekday` walks outward from it, so 「10 月 20 日（二）」 lands on the
    year 10/20 is actually a Tuesday.
  */
  const readDate = `${read.year ?? new Date().getUTCFullYear()}-${read.monthDay}`;

  /*
    The year, checked against the weekday the ticket printed.

    「我傳機票資訊 結果日期不正確」 — 「10 月 20 日（二）」 with no year came back
    as 2023-10-20, a Friday, and a trip was created three years in the past.
    See `yearFromWeekday`.
  */
  const printedWeekday = cleanText(value.departureWeekday, 12);
  const departureDate = yearFromWeekday(readDate, printedWeekday);

  const flight: ParsedFlight = { departureDate, departureTime };
  if (printedWeekday) flight.departureWeekday = printedWeekday;
  /*
    A year the ticket did not print and we had to work out is worth flagging,
    so the traveller checks the one field a screenshot could not state. The
    booking is still filed: an unflagged wrong year was the actual harm.
  */
  if (departureDate !== readDate || read.year === undefined) flight.isUncertain = true;

  if (value.direction === 'OUTBOUND' || value.direction === 'RETURN') flight.direction = value.direction;

  flight.flightNumber = cleanText(value.flightNumber, 12);
  flight.departureAirport = cleanText(value.departureAirport, 80);
  flight.departureAirportIata = cleanIata(value.departureAirportIata);
  flight.arrivalAirport = cleanText(value.arrivalAirport, 80);
  flight.arrivalAirportIata = cleanIata(value.arrivalAirportIata);
  flight.arrivalTime = cleanTime(value.arrivalTime);

  const readArrival = readTicketDate(value.arrivalDate);
  /*
    Moved by the same number of years as the departure, not re-derived.

    The arrival carries its own weekday only sometimes, and a flight that
    lands the next morning would be dragged to a different year by a weekday
    lookup of its own. The two ends of one flight move together or not at all.

    A yearless arrival simply takes the departure's year, with one exception:
    a flight that lands on an earlier month and day than it left crossed New
    Year, so it belongs to the next one. Only a day or two of crossing counts
    — anything wider apart is a misread, and falls through to the check below.
  */
  const departureYear = Number(departureDate.slice(0, 4));
  let arrivalDate: string | undefined;
  if (readArrival?.year !== undefined) {
    arrivalDate = `${readArrival.year + (departureYear - Number(readDate.slice(0, 4)))}-${readArrival.monthDay}`;
  } else if (readArrival) {
    arrivalDate = `${departureYear}-${readArrival.monthDay}`;
    const rolled = `${departureYear + 1}-${readArrival.monthDay}`;
    const daysLater = (Date.parse(rolled) - Date.parse(departureDate)) / 86_400_000;
    if (arrivalDate < departureDate && daysLater >= 0 && daysLater <= 2) arrivalDate = rolled;
  }
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

/**
 * Which legs a parse can actually fill, given the trip's flight mode.
 *
 * Pure, and separate from the component, because the version that lived inside
 * a setState updater shipped broken: it collected the filled legs while React
 * ran the updater, and the very next line read that list — empty, because React
 * runs an updater on its own schedule. Every successful upload reported
 *「這張截圖看不出航班資訊」.
 *
 * React sometimes evaluates an updater eagerly, which is why it worked on a
 * quiet fiber and failed on a busy one, and why a component test could pass
 * against the broken code. Deciding here removes the timing from the question.
 */
export const legsToApply = (
  legs: { OUTBOUND?: ParsedFlight; RETURN?: ParsedFlight },
  flightMode: 'ROUND_TRIP' | 'ONE_WAY',
): Array<['OUTBOUND' | 'RETURN', ParsedFlight]> => {
  // A one-way trip has only an outbound field, so a return read from the image
  // fills it rather than being dropped on the floor.
  const candidates: Array<['OUTBOUND' | 'RETURN', ParsedFlight | undefined]> =
    flightMode === 'ONE_WAY'
      ? [['OUTBOUND', legs.OUTBOUND ?? legs.RETURN]]
      : [['OUTBOUND', legs.OUTBOUND], ['RETURN', legs.RETURN]];

  return candidates.filter(
    (entry): entry is ['OUTBOUND' | 'RETURN', ParsedFlight] => Boolean(entry[1]),
  );
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
      4b. "departureWeekday": the weekday printed beside that date, exactly as
         written — 「二」 from 「10 月 20 日（二）」, or "Tue". Omit it if the
         ticket does not print one. It is how the year is checked when the
         ticket does not state a year, which is most of them.
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
      - Many confirmations print the day and month and no year. Do not fall
        back on a year you have seen in training data: return the date as
        "MM-DD" with no year, copy the weekday into "departureWeekday", and
        let the caller resolve it. If a year really is printed, use the full
        "YYYY-MM-DD".

      Return JSON shaped { "flights": [ ... ] }.
    `;

/**
 * Replaces the airports a ticket named with the directory's own records.
 *
 * 「航班有帶入 但你沒帶入機場」. The ticket prints 「Taipei（TPE）到 Tokyo（NRT）」
 * and the model reports exactly that, so the itinerary said 抵達機場 · Taipei —
 * a city, for a card whose entire subject is which airport. The directory has
 * held 「TPE · Taiwan Taoyuan International Airport」 with its city, country and
 * coordinates all along.
 *
 * Deliberately `applyAirport`, the same write a traveller picking from the
 * autocomplete performs. A screenshot and a hand-pick should not produce two
 * different kinds of anchor, and every previous bug in this area has been one
 * path doing less than the other.
 *
 * Only a side naming an IATA code is touched. A code the directory does not
 * hold keeps the name off the ticket — it is the only name there is — but
 * loses its coordinates, because a changed flight otherwise leaves the
 * previous airport's position behind, and a wrong location does not look
 * missing, so nobody checks it.
 */
export const locateAirports = (anchor: FlightAnchor): FlightAnchor => {
  let next = anchor;

  for (const side of ['departure', 'arrival'] as const) {
    const code = side === 'departure' ? next.departureAirportIata : next.arrivalAirportIata;
    if (!code) continue;

    const known = findAirportByIata(code);
    if (known) {
      const printed = (side === 'departure' ? next.departureAirport : next.arrivalAirport)?.trim();
      next = applyAirport(next, side, known);
      /*
        The ticket's own wording wins when it already names an airport.

        The directory is English-only — an MVP limitation noted where it is
        declared — so a confirmation printing 「桃園國際機場」 would be rewritten
        into 「Taiwan Taoyuan International Airport」, which is a worse label for
        the person reading it. What the ticket gives that is *not* a name is a
        city: 「Taipei（TPE）到 Tokyo（NRT）」 is what produced 抵達機場 · Taipei.

        So the directory supplies the name only where the ticket supplied a
        city or nothing at all. Identity — code, city, country, coordinates —
        always comes from the directory, because that is what it is for.
      */
      const printedIsACity = !printed || printed.toLowerCase() === known.city.toLowerCase();
      if (!printedIsACity) {
        next = side === 'departure'
          ? { ...next, departureAirport: printed }
          : { ...next, arrivalAirport: printed };
      }
      continue;
    }

    next = { ...next };
    if (side === 'departure') {
      delete next.departureAirportLatitude;
      delete next.departureAirportLongitude;
    } else {
      delete next.arrivalAirportLatitude;
      delete next.arrivalAirportLongitude;
    }
  }

  return next;
};

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
    return locateAirports(next);
  });

/**
 * A read boarding pass, as the anchor the trip is planned around.
 *
 * 「這個不能直接讓用戶在這個介面上傳」 — the planning card tells the traveller
 * it needs their flights, and the upload sitting directly under that message
 * used to refuse exactly those screenshots and send them to another screen.
 * This is the conversion that lets the one entry answer its own demand.
 *
 * `FlightAnchor` requires a date, a time and a departure airport because
 * everything downstream is built from those three: which hours of which day
 * are gone, and where the traveller is standing when the trip starts. A leg
 * missing any of them is dropped rather than filed with a blank — the same
 * refusal `normalizeParsedRental` makes for a hire with no company.
 */
export const flightAnchorsFromParsed = (
  flights: ParsedFlight[],
  makeId: () => string,
): FlightAnchor[] => flights.flatMap(flight => {
  const { direction, departureDate, departureTime, departureAirport } = flight;
  if (!direction || !departureDate || !departureTime || !departureAirport) return [];

  const anchor: FlightAnchor = {
    id: makeId(),
    direction,
    departureDate,
    departureTime,
    departureAirport,
    // The same two the manual form starts every anchor with. A screenshot
    // does not say how early somebody wants to be at the airport, and
    // `source` stays MANUAL because the traveller still owns and edits it.
    airportArrivalBufferMinutes: 120,
    source: 'MANUAL',
  };

  if (flight.departureAirportIata) anchor.departureAirportIata = flight.departureAirportIata;
  if (flight.arrivalAirport) anchor.arrivalAirport = flight.arrivalAirport;
  if (flight.arrivalAirportIata) anchor.arrivalAirportIata = flight.arrivalAirportIata;

  if (flight.arrivalDate) anchor.arrivalDate = flight.arrivalDate;
  if (flight.arrivalTime) anchor.arrivalTime = flight.arrivalTime;

  // Where those airports actually are. See `locateAirports` — the same join,
  // from the same curated table, as the upload into an existing trip.
  return [locateAirports(anchor)];
});
