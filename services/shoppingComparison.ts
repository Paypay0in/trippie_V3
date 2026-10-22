/**
 * Which two countries this trip's shopping list compares.
 *
 * Destination against home, where home is where the traveller lives — 「Use
 * the user's Profile country of residence」 — and never where their passport
 * was issued. Those are different facts about different people often enough
 * that the travel-rules research already refuses to conflate them, and a
 * price comparison that guessed wrong would send somebody home with a
 * suitcase of things that were cheaper at home.
 *
 * Nothing is inferred from nationality, IP or GPS. A missing residence is
 * asked for, because 「compare against nowhere」 is not a useful default and
 * 「compare against Taiwan」 is a decision nobody made.
 *
 * The trip may override the pair: a Taiwan-based traveller flying to Korea
 * may want Korea against Canada, because that is where the person they are
 * buying for lives.
 */
import { countryKey } from './countryIdentity';
import { ComparisonCountry, comparisonCountry } from './comparisonCountries';

export interface ComparisonPair {
  /** Where the trip is. Absent when the trip has no country yet. */
  destination?: ComparisonCountry;
  /** Where it is being compared against. Absent until somebody says. */
  home?: ComparisonCountry;
  /** True when the pair is only waiting on a residence nobody has given. */
  needsHome: boolean;
}

/**
 * A country code out of whatever the trip wrote down.
 *
 * `countryKey` already knows that 日本, Japan and JP are one country, and it
 * is the table the rest of the app groups on. Reused rather than restated:
 * two spellings of 「which country is this」 is two answers waiting to
 * disagree, which is the shape of defect this codebase keeps finding.
 */
export const countryCodeOf = (written?: string): string | undefined => {
  const key = countryKey(written);
  if (!key) return undefined;
  const code = key.toUpperCase();
  return comparisonCountry(code) ? code : undefined;
};

export const comparisonPair = (input: {
  /** `travelCountry` or `destinationCountry`, as the trip spelled it. */
  tripCountry?: string;
  /** The traveller's Profile residence. */
  residenceCountryCode?: string;
  /** This trip's override, when one was set. */
  comparisonCountryCode?: string;
}): ComparisonPair => {
  const destination = comparisonCountry(countryCodeOf(input.tripCountry));
  const home = comparisonCountry(input.comparisonCountryCode)
    ?? comparisonCountry(input.residenceCountryCode);

  /*
    Comparing a country with itself answers nothing, and it is a real state:
    a Taiwanese traveller's domestic trip, or an override set to the
    destination by accident.
  */
  const usable = home && destination && home.code === destination.code ? undefined : home;

  return { destination, home: usable, needsHome: !usable };
};
