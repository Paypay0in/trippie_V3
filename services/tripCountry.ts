/**
 * The country a trip is actually in, when nobody wrote it down.
 *
 * `travelCountry` is filled by destination detection, and a trip created from
 * a boarding pass never went through that — it was named 「沖繩」 by hand and the
 * field stayed empty. Everything that reasons about where a trip is, including
 * which travel modes the provider can answer, then reasons about nothing.
 *
 * The flight already knows. The ticket named NRT, the curated directory holds
 * 「Narita International Airport · Tokyo · Japan」, and that is a fact somebody
 * checked rather than a guess from coordinates — a bounding box around Japan
 * contains Busan, and inventing geography to patch a missing field is how a
 * confidently wrong answer gets in.
 *
 * The arrival of the outbound leg, because that is where the trip happens. The
 * departure airport is home.
 */
import { FlightAnchor } from '../types';
import { findAirportByIata } from './airportDirectory';

export const countryFromFlights = (anchors: FlightAnchor[] = []): string | undefined => {
  const outbound = anchors.find(anchor => anchor.direction === 'OUTBOUND') || anchors[0];
  if (!outbound) return undefined;

  // The anchor carries the country directly once an airport was picked or
  // located; the directory is the fallback for one stored before that.
  if (outbound.arrivalAirportCountry) return outbound.arrivalAirportCountry;
  return outbound.arrivalAirportIata
    ? findAirportByIata(outbound.arrivalAirportIata)?.country
    : undefined;
};

/** What was written down, and only then what the ticket implies. */
export const tripCountry = (stated: string | undefined, anchors: FlightAnchor[] = []): string | undefined =>
  stated?.trim() || countryFromFlights(anchors);
