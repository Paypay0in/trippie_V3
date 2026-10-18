/**
 * Saved places sitting in a country the traveller has never been planning for.
 *
 * 「怎麼越弄越糟 我的釜山都不見了 還出現美國跟加拿大的」. The backfill's country
 * guard excused itself for every save that had not recorded a country — which
 * was every save it existed to repair — so note titles matched real businesses
 * on other continents and those addresses were written over Korean saves. The
 * guard is fixed; the records it already damaged are still damaged.
 *
 * Finding them is not a guess, but 「a country with no trip」 was too wide a
 * net. 「這些不是都有對應收藏的了嗎 幹嘛顯示」 — twenty 釜山 saves, every one
 * correctly bound, listed as suspect because the 釜山 trip had not been
 * archived yet.
 *
 * Two things make a country known now: a trip that mentions it, planned or
 * finished, and the collection itself. Somebody with twenty saves in Korea
 * collects for Korea, whether or not they have booked anything — that is what
 * a collection is for. The damage this was built to find was a handful of
 * records flung onto other continents, and a handful still stands out.
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
/**
 * How much of a collection a country must hold to be one it is about.
 *
 * A quarter, and never fewer than five records. The corruption this exists to
 * find put a handful on other continents out of fifty; a country someone
 * genuinely collects for is not a rounding error in their own collection.
 *
 * The floor is what a test caught: in a collection of two, one Vancouver
 * binding is half of everything, and a share alone would have called the
 * damage a destination.
 */
export const COLLECTED_FOR_SHARE = 0.25;
export const COLLECTED_FOR_COUNT = 5;

export const strandedSaves = (
  inspirations: SavedTravelInspiration[],
  knownCountries: string[],
): StrandedSave[] => {
  const known = new Set(
    knownCountries.map(country => countryKey(country)).filter(Boolean),
  );

  /*
    Countries the collection itself is about. See `COLLECTED_FOR_SHARE`.
  */
  const counted = new Map<string, number>();
  inspirations.forEach(inspiration => {
    const key = countryKey(inspiration.country || '');
    if (key) counted.set(key, (counted.get(key) || 0) + 1);
  });
  const total = Array.from(counted.values()).reduce((sum, count) => sum + count, 0);
  counted.forEach((count, key) => {
    if (count >= COLLECTED_FOR_COUNT && total > 0 && count / total >= COLLECTED_FOR_SHARE) {
      known.add(key);
    }
  });
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
