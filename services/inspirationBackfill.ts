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
  /**
   * The country this save already claims, which is the one to search in.
   *
   * 「這個是韓國釜山 不是加拿大」 — the backfill searched with the *open trip's*
   * country, so a Busan note looked at while a Japan trip was open was asked
   * for in the wrong country, and an English restaurant name found a real
   * place with the same name on the other side of the world.
   *
   * The save has said which country it is in since the day it was saved. That
   * is the fact; the trip on screen is a coincidence.
   */
  country?: string;
}

/**
 * Whether this record knows where it is.
 *
 * A city equal to its own country is not a city — that is the exact shape the
 * old save path produced, taking the city from a trip whose destination field
 * held the country.
 */
export const knowsWhereItIs = (
  place: { formattedAddress?: string; city?: string; country?: string },
): boolean => {
  const city = (place.city || '').trim();
  const country = (place.country || '').trim();
  const hasRealCity = Boolean(city) && city.toLowerCase() !== country.toLowerCase();
  return Boolean(place.formattedAddress?.trim()) && hasRealCity;
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
    if (existing) {
      existing.inspirationIds.push(inspiration.id);
      existing.country = existing.country || inspiration.country?.trim() || undefined;
    } else {
      gaps.set(placeName, {
        id: placeName,
        placeName,
        inspirationIds: [inspiration.id],
        country: inspiration.country?.trim() || undefined,
      });
    }
  });
  return Array.from(gaps.values());
};
