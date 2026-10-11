import { ParsedFlight } from './flightIntake';
import { ParsedStay } from './stayIntake';
import { findAirportByIata } from './airportDirectory';

/**
 * A trip, derived from the bookings already on the traveller's phone.
 *
 * 「這個是要提示用戶上傳機票旅館等住宿」 — which is what the tile on the home
 * screen says it does, and not what it did: 匯入旅程資料・機票・住宿・訂單 went
 * to the blank new-trip form, the same destination as 新增旅程 beside it.
 *
 * The readers were never the missing part. `flightIntake` and `stayIntake`
 * both exist and both work; they just lived inside a trip, so they could only
 * ever be used by somebody who had already typed in the dates the boarding
 * pass was holding all along. This is the piece between them: what the
 * bookings say the trip *is*.
 *
 * Nothing here guesses. Every field is either read off a booking or left
 * empty for the traveller to fill, because a trip that arrives pre-filled with
 * plausible wrong dates is worse than an empty form — the empty form gets
 * read.
 */

export interface DerivedTrip {
  /** The city flown to, when the arrival airport is one we actually know. */
  destination?: string;
  country?: string;
  /** Leaving home. */
  startDate?: string;
  /** Home again. */
  endDate?: string;
}

/** What was read, and what it was read from — for showing before saving. */
export interface BookingReadout {
  flights: ParsedFlight[];
  stays: ParsedStay[];
}

const earliest = (dates: (string | undefined)[]): string | undefined => {
  const real = dates.filter((date): date is string => Boolean(date));
  return real.length ? real.slice().sort()[0] : undefined;
};

const latest = (dates: (string | undefined)[]): string | undefined => {
  const real = dates.filter((date): date is string => Boolean(date));
  return real.length ? real.slice().sort()[real.length - 1] : undefined;
};

/**
 * Where the trip goes.
 *
 * The outbound flight's arrival airport, resolved through the curated
 * directory — never from the model, and never from the raw airport name. An
 * invented or mis-expanded IATA code names the wrong city on the trip, and a
 * traveller correcting a city they did not type is a traveller who stops
 * believing the rest of the import.
 *
 * An airport that is not in the directory yields nothing rather than its own
 * name: 「Gimhae International Airport」 is not a destination anybody would have
 * typed, and leaving it blank asks a question the form is already asking.
 */
const destinationFrom = (flights: ParsedFlight[]): Pick<DerivedTrip, 'destination' | 'country'> => {
  const outbound = flights.find(flight => flight.direction !== 'RETURN');
  const code = outbound?.arrivalAirportIata;
  if (!code) return {};
  const airport = findAirportByIata(code);
  if (!airport) return {};
  return { destination: airport.city, country: airport.country };
};

/**
 * The dates.
 *
 * Start is the earliest thing that happens: the outbound departure, or a
 * check-in when somebody imported only a hotel.
 *
 * End is the latest, and for the return leg that is the *arrival* date, not
 * the departure. A flight that leaves Tokyo at 23:50 on the 7th and lands on
 * the 8th is an 8-day trip; ending it on the 7th cuts off the day the
 * traveller is still travelling, which is the day they most need the ledger.
 *
 * A return leg with no arrival date falls back to its departure date — one day
 * short is a visible error on a screen they confirm, and inventing the next
 * day would be an invisible one.
 */
const datesFrom = (flights: ParsedFlight[], stays: ParsedStay[]): Pick<DerivedTrip, 'startDate' | 'endDate'> => {
  const outbound = flights.filter(flight => flight.direction !== 'RETURN');
  const returning = flights.filter(flight => flight.direction === 'RETURN');

  const startDate = earliest([
    ...outbound.map(flight => flight.departureDate),
    ...stays.map(stay => stay.checkInDate),
  ]);

  const endDate = latest([
    ...returning.map(flight => flight.arrivalDate || flight.departureDate),
    ...stays.map(stay => stay.checkOutDate),
  ]);

  return {
    startDate,
    // A trip cannot end before it starts; a readout that says so was misread,
    // and the pair is dropped rather than shown as a negative-length trip.
    endDate: startDate && endDate && endDate < startDate ? undefined : endDate,
  };
};

export const tripFromBookings = ({ flights, stays }: BookingReadout): DerivedTrip => ({
  ...destinationFrom(flights),
  ...datesFrom(flights, stays),
});

/**
 * Is there enough here to be worth offering?
 *
 * A readout with no dates and no destination is a failed read dressed as a
 * result. Saying so costs one retry; a trip named 「未命名旅程」 with no dates is
 * the thing he has already deleted three of.
 */
export const worthKeeping = (trip: DerivedTrip): boolean =>
  Boolean(trip.startDate || trip.destination);

/** 「讀到 1 張機票・2 筆住宿」, so the count is visible before anything is saved. */
export const readoutSummary = ({ flights, stays }: BookingReadout): string => {
  const parts: string[] = [];
  if (flights.length) parts.push(`${flights.length} 張機票`);
  if (stays.length) parts.push(`${stays.length} 筆住宿`);
  return parts.length ? `讀到 ${parts.join('・')}` : '沒有讀到可用的資料';
};
