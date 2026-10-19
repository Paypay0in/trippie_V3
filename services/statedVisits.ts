/**
 * Places the traveller says they have been to.
 *
 * 「下方兩個我去過了」 — on a 釜山 collection where neither carried 已訪, because
 * neither had ever been on a dated itinerary in this app.
 *
 * `visitedPlaces` derives 已訪 from finished trips, and that remains the right
 * default: a fact that can be recomputed cannot go stale. But derivation can
 * only answer 「did a trip in this app take you there」. A place visited before
 * the app existed, on somebody else's trip, or on an afternoon nobody wrote
 * down is invisible to it, and the collection belongs to the traveller — so it
 * has to be able to hold what only they know.
 *
 * Stored by place identity rather than by saved-place id, deliberately: the
 * same restaurant may be saved twice from two posts, and 「去過」 is a fact about
 * the restaurant. `placeIdentities` is the same rule the derivation matches on,
 * which is why it is imported rather than restated here.
 *
 * Device-local. `trip_inspirations` has no column for this, and the standing
 * rule is that nothing is wired to a column before the column exists.
 */
import { placeIdentities } from './visitedPlaces';

const STORAGE_KEY = 'trippie_visited_places_v1';

/** Place identity → the date the traveller says they went, `YYYY-MM-DD`. */
export type StatedVisits = Record<string, string>;

type PlaceLike = { placeId?: string; placeName?: string; location?: string; title?: string };

export const loadStatedVisits = (storage?: Storage): StatedVisits => {
  const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!store) return {};
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
    );
  } catch {
    // A collection that cannot read one key is still a collection.
    return {};
  }
};

export const saveStatedVisits = (visits: StatedVisits, storage?: Storage): void => {
  const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch {
    // Out of quota or private mode. Losing the mark is survivable; throwing in
    // the middle of a tap is not.
  }
};

/** Whether the traveller has said this one themselves. */
export const isStatedVisited = (place: PlaceLike, visits: StatedVisits): boolean =>
  placeIdentities(place).some(key => Boolean(visits[key]));

/**
 * Say it, or take it back.
 *
 * Every identity the place has is written, not just the first: a saved place
 * that carries a Google id and an itinerary item that never resolved are the
 * same restaurant, and marking one has to answer for both. That is the same
 * reason the derivation indexes under both.
 */
export const toggleStatedVisit = (
  place: PlaceLike,
  visits: StatedVisits,
  today: string,
): StatedVisits => {
  const keys = placeIdentities(place);
  if (keys.length === 0) return visits;

  const next = { ...visits };
  if (isStatedVisited(place, visits)) {
    keys.forEach(key => { delete next[key]; });
    return next;
  }
  keys.forEach(key => { next[key] = today; });
  return next;
};
