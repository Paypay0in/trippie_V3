/**
 * Where the rest of the collection is, when this trip's shelf is empty.
 *
 * 「我的旅行筆記都不見了」.
 *
 * They were not. The planner lists the saved places that belong to the trip's
 * destination — this trip is 墨西哥 and the collection is 韓國 and 日本 — so the
 * screen said 「目前沒有這個目的地的收藏靈感」, which is true, and directly above
 * it said 「有 21 個收藏的地點資料要更新」, which is also true, and counts the
 * whole collection rather than this destination.
 *
 * Two counts of the same thing, stacked, with nothing saying one is scoped and
 * the other is not. Read together they say 「you have 21 and you have none」,
 * and the reader is left to decide which half is the bug. Nothing was lost;
 * the screen just never said where anything was.
 */
import { SavedTravelInspiration } from '../types';
import { countryDisplayName, sameCountry } from './countryIdentity';
import i18n from '../i18n/config';

export interface ElsewhereCount {
  /** As the trip would display it. */
  country: string;
  count: number;
}

/**
 * The saved places that belong to some other country, counted per country.
 *
 * Empty when the collection really is empty — which is a different sentence
 * and deserves one.
 */
export const savedElsewhere = (
  inspirations: SavedTravelInspiration[],
  destinationCountry?: string,
): ElsewhereCount[] => {
  const counts = new Map<string, number>();

  inspirations.forEach(item => {
    const country = (item.country || '').trim();
    if (!country) return;
    // Compared on identity, never on text: 日本 and Japan are one place.
    if (destinationCountry && sameCountry(country, destinationCountry)) return;
    const shown = countryDisplayName(country) || country;
    counts.set(shown, (counts.get(shown) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    // Most first: 「韓國 18、日本 3」 answers 「where is my collection」 in the
    // order somebody would ask it.
    .sort((left, right) => right.count - left.count || left.country.localeCompare(right.country));
};

/** 「韓國 18、日本 3」. */
export const elsewhereLabel = (counts: ElsewhereCount[]): string =>
  counts
    .map(entry => i18n.t('saved.elsewhere.entry', { country: entry.country, n: entry.count }))
    .join(i18n.t('common.listSeparator'));
