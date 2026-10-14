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
 * A resolved Google id when there is one, otherwise the trimmed lowercased
 * name — the same rule `inspirationKey` uses, so a place matches itself across
 * the collection and the plan.
 */
const keyOf = (place: { placeId?: string; placeName?: string; location?: string; title?: string }): string => {
  const id = place.placeId?.trim();
  if (id) return `place:${id}`;
  const name = (place.placeName || place.location || place.title || '').trim().toLocaleLowerCase();
  return name ? `name:${name}` : '';
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
      const key = keyOf(item);
      if (!key) return;
      const existing = visits.get(key);
      // The most recent visit: 「上次去是什麼時候」 is the question being asked.
      if (!existing || existing.date < item.date) {
        visits.set(key, { date: item.date, tripName: trip.name });
      }
    });
  });

  return visits;
};

/** The visit for one saved place, if it has one. */
export const visitOf = (
  place: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>,
  visits: Map<string, PlaceVisit>,
): PlaceVisit | undefined => {
  const key = keyOf(place);
  return key ? visits.get(key) : undefined;
};

/** 「已訪 · 2026/03/22」. */
export const visitLabel = (visit?: PlaceVisit): string =>
  (visit ? `已訪 · ${visit.date.replace(/-/g, '/')}` : '');
