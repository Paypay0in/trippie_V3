/**
 * Which saved places have already been visited, and when.
 *
 * 「收藏的筆記中，若某次旅行有去過。要記錄：去的時間，並標註『已訪』」.
 *
 * Derived, never stored. The app already holds the answer: a trip that has
 * finished, with that place on one of its days. Storing 「visited」 as a field on
 * the saved place would be a seventh thing for the four rebuilders in this
 * codebase to drop — the merge, the sync, the localStorage loader and the
 * backfill's argument — which is the shape of every bug in this area tonight.
 * A fact that can be recomputed cannot go stale and cannot be lost.
 *
 * The date is the day it was on the plan, not the day anything was ticked:
 * 「去的時間」 is a date the traveller can recognise, and a completion checkbox
 * is only ever ticked by the people who tick checkboxes.
 */
import { ItineraryItem, SavedTravelInspiration, Trip } from '../types';

export interface PlaceVisit {
  /** The day it was on the plan, `YYYY-MM-DD`. */
  date: string;
  /** The trip it belonged to, for saying which journey it was. */
  tripName?: string;
}

/**
 * The identity two records are matched on.
 *
 * Both the resolved Google id and the trimmed lowercased name, not one or the
 * other.
 *
 * 「去過的要標記」 over a 釜山 collection with no 已訪 on it. The old rule took the
 * id when there was one and the name otherwise — so a saved place that had
 * been resolved and an itinerary item that never was produced two different
 * keys for the same restaurant, and the visit was invisible.
 *
 * That is the common case rather than an edge: the collection has been through
 * a backfill and old itineraries have not. Indexing under every identity a
 * record has costs one extra map entry and makes the match work in both
 * directions.
 */
const keysOf = (place: { placeId?: string; placeName?: string; location?: string; title?: string }): string[] => {
  const keys: string[] = [];
  const id = place.placeId?.trim();
  if (id) keys.push(`place:${id}`);
  const name = (place.placeName || place.location || place.title || '').trim().toLocaleLowerCase();
  if (name) keys.push(`name:${name}`);
  return keys;
};

/** A day that has already happened. Today still counts as happening. */
const isPast = (date: string, today: string): boolean =>
  Boolean(date) && date < today;

/**
 * Every visited place, keyed by identity, carrying the most recent visit.
 *
 * @param trips the traveller's own finished and in-progress journeys.
 * @param today `YYYY-MM-DD`; a day that has not arrived is not a visit.
 */
export const visitsByPlace = (
  trips: Array<Pick<Trip, 'name' | 'itinerary'>>,
  today: string,
): Map<string, PlaceVisit> => {
  const visits = new Map<string, PlaceVisit>();

  trips.forEach(trip => {
    (trip.itinerary || []).forEach((item: ItineraryItem) => {
      if (!isPast(item.date, today)) return;
      keysOf(item).forEach(key => {
        const existing = visits.get(key);
        // The most recent visit: 「上次去是什麼時候」 is the question being asked.
        if (!existing || existing.date < item.date) {
          visits.set(key, { date: item.date, tripName: trip.name });
        }
      });
    });
  });

  return visits;
};

/** The visit for one saved place, if it has one. */
export const visitOf = (
  place: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>,
  visits: Map<string, PlaceVisit>,
): PlaceVisit | undefined => {
  // Either identity will do: whichever of the two records carries one.
  for (const key of keysOf(place)) {
    const visit = visits.get(key);
    if (visit) return visit;
  }
  return undefined;
};

/**
 * 「已訪 · 2026」.
 *
 * 「去過的要標記🏷️ 並寫下旅行年份」 — the year, not the day. A collection is
 * scanned rather than read, and 「did I go, and roughly when」 is the question
 * being answered; 2026/03/22 makes somebody parse a date to learn 2026.
 *
 * The exact day is still on the visit for anywhere that wants it.
 */
export const visitLabel = (visit?: PlaceVisit): string =>
  (visit ? `已訪 · ${visit.date.slice(0, 4)}` : '');
