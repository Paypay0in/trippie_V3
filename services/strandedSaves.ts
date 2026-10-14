/**
 * Saved places sitting in a country the traveller has never been planning for.
 *
 * 「怎麼越弄越糟 我的釜山都不見了 還出現美國跟加拿大的」. The backfill's country
 * guard excused itself for every save that had not recorded a country — which
 * was every save it existed to repair — so note titles matched real businesses
 * on other continents and those addresses were written over Korean saves. The
 * guard is fixed; the records it already damaged are still damaged.
 *
 * Finding them is not a guess. A collection holds the places someone saved for
 * their own trips, so a save in a country that appears in none of their trips
 * is either a mistake or a place they have no trip for yet — and in both cases
 * it is worth showing them rather than leaving it to be scrolled past.
 *
 * Deliberately not a repair. 「錯」 is not a state the app can detect, and this
 * does not pretend otherwise: it narrows seventeen records down to the few
 * worth looking at and leaves the correction to the person who knows.
 */
import { SavedTravelInspiration } from '../types';
import { countryKey, countryDisplayName } from './countryIdentity';

export interface StrandedSave {
  id: string;
  placeName: string;
  /** The country it currently claims, in the language the app speaks. */
  country: string;
  city: string;
}

/**
 * @param knownCountries every country the traveller's own trips mention.
 */
export const strandedSaves = (
  inspirations: SavedTravelInspiration[],
  knownCountries: string[],
): StrandedSave[] => {
  const known = new Set(
    knownCountries.map(country => countryKey(country)).filter(Boolean),
  );
  /*
    With no trips to compare against, everything would look stranded. Showing
    the whole collection as suspect is worse than showing nothing.
  */
  if (known.size === 0) return [];

  return inspirations
    .filter(inspiration => {
      const key = countryKey(inspiration.country || '');
      // A save that never said where it is has not landed anywhere wrong.
      return Boolean(key) && !known.has(key);
    })
    .map(inspiration => ({
      id: inspiration.id,
      placeName: (inspiration.placeName || '').trim(),
      country: countryDisplayName(inspiration.country || ''),
      city: (inspiration.city || '').trim(),
    }));
};
