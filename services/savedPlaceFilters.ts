/**
 * 「分類｜全部｜已訪｜待訪」.
 *
 * Forty-seven saved places in one scroll is a list nobody reads to the
 * bottom. Two questions get asked of a collection that size — 「what kind of
 * thing is it」 and 「have I been」 — and they are asked together: 「哪些咖啡廳
 * 我還沒去」 is one question, and answering it with two mutually exclusive
 * filters would mean asking it twice.
 *
 * A function rather than state inside the screen, because the screen that
 * shows these also fetches images, resolves places and reads opening hours,
 * and a rule worth getting right should not need all of that standing up to
 * be checked.
 */

import { PlaceCategory, SavedTravelInspiration } from '../types';
import { PlaceVisit, visitOf } from './visitedPlaces';

export type VisitFilter = 'all' | 'visited' | 'not';

export interface SavedPlaceFilter {
  /** A tag, or everything. */
  category: PlaceCategory | 'all';
  visited: VisitFilter;
}

export const NO_FILTER: SavedPlaceFilter = { category: 'all', visited: 'all' };

/**
 * An untagged place is 「其他」 rather than invisible.
 *
 * The tag is resolved from Google and is routinely absent; dropping those
 * from every filtered view would hide the places this app knows least about,
 * which are exactly the ones somebody saved by hand.
 */
export const categoryOf = (place: Pick<SavedTravelInspiration, 'category'>): PlaceCategory =>
  (place.category ?? 'other') as PlaceCategory;

/** The tags this destination actually holds, commonest first, with counts. */
export const categoriesIn = (
  places: Array<Pick<SavedTravelInspiration, 'category'>>,
): Array<[PlaceCategory, number]> => {
  const counts = new Map<PlaceCategory, number>();
  places.forEach(place => {
    const key = categoryOf(place);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
};

/**
 * What survives both chips.
 *
 * 「已訪」 is whatever `visitOf` answers — this project's one rule for it, and
 * the same one the chip on each card reads. A second idea of 「have I been」
 * living here would put a 已訪 badge on a card the 待訪 filter had just kept.
 */
export const filterSavedPlaces = <T extends SavedTravelInspiration>(
  places: T[],
  filter: SavedPlaceFilter,
  visits?: Map<string, PlaceVisit>,
): T[] => places.filter(place => {
  if (filter.category !== 'all' && categoryOf(place) !== filter.category) return false;
  if (filter.visited === 'all') return true;
  const been = Boolean(visits && visitOf(place, visits));
  return filter.visited === 'visited' ? been : !been;
});
