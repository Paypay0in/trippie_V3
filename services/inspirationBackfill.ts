/**
 * Saved places that never recorded where they are.
 *
 * Three separate symptoms in one night turned out to be this one gap: 「日本・
 * 日本」 under a saved place, the home screen collapsing every note in a country
 * into one card, and 「らぁ麺や 嶋 一帶」 as an area heading. In each case the
 * record carried a name and nothing else, so there was no address to read a
 * district out of and no city to group by.
 *
 * Google has the answer for all of them — 「らぁ麺や 嶋」 resolves to
 * 「3-chōme-41-11 Honmachi, Shibuya, Tokyo」 — it was simply never asked, because
 * these were saved before the save path looked anything up.
 *
 * Only blanks are filled. A traveller who corrected a place by hand has the
 * strongest claim on it, and a backfill that overwrote their correction would
 * be the one failure that makes this worse than leaving it alone.
 */
import { SavedTravelInspiration } from '../types';

export interface PlaceGap {
  id: string;
  placeName: string;
  /** Every saved row for this place; one lookup settles them together. */
  inspirationIds: string[];
}

/**
 * Whether this record knows where it is.
 *
 * A city equal to its own country is not a city — that is the exact shape the
 * old save path produced, taking the city from a trip whose destination field
 * held the country.
 */
export const knowsWhereItIs = (inspiration: SavedTravelInspiration): boolean => {
  const city = (inspiration.city || '').trim();
  const country = (inspiration.country || '').trim();
  const hasRealCity = Boolean(city) && city.toLowerCase() !== country.toLowerCase();
  return Boolean(inspiration.formattedAddress?.trim()) && hasRealCity;
};

/**
 * One entry per place that still needs looking up, keyed by name.
 *
 * Grouped by name because that is what the lookup takes, and two rows for the
 * same restaurant would otherwise spend two requests to learn the same fact.
 */
export const placesNeedingBackfill = (inspirations: SavedTravelInspiration[]): PlaceGap[] => {
  const gaps = new Map<string, PlaceGap>();
  inspirations.forEach(inspiration => {
    if (knowsWhereItIs(inspiration)) return;
    const placeName = (inspiration.placeName || '').trim();
    if (!placeName) return;
    const existing = gaps.get(placeName);
    if (existing) existing.inspirationIds.push(inspiration.id);
    else gaps.set(placeName, { id: placeName, placeName, inspirationIds: [inspiration.id] });
  });
  return Array.from(gaps.values());
};
