/**
 * Saved places this device has been told to forget.
 *
 * 「我剛剛刪除了首爾的收藏 又跑回來了」 — deleted from the home screen's
 * 儲存的旅行筆記, back on the next sync.
 *
 * The prune in `tripSync` can only delete rows of the trip it is pushing, and
 * only a trip that is open is ever pushed. Deleting from the home screen
 * touches neither: `removeSavedTravelInspiration` filtered local state and
 * said nothing to anyone. The row stayed on the server, and the next time that
 * trip synced, `applyTripInspirations` — which replaces this trip's places
 * with the server's copy, because a merge cannot express a deletion — put it
 * back.
 *
 * So the deletion had two doors and only one of them did the work: delete
 * inside the trip and it stuck, delete from the shelf and it did not. That is
 * the shape this codebase has paid for repeatedly, and the answer is the same
 * one `deletedTrips` already uses — write the refusal down, in one place, and
 * have every path read it.
 *
 * Keyed on the place rather than on the row id, via `inspirationKey`: the
 * server's id for a place that arrived from somebody else's collection is not
 * the id this phone minted for it (see `alignInspirationRowIds`), so an id
 * would name a row this device cannot recognise when it comes back.
 *
 * Device-local, like the trip tombstones, and for the same reason: 「take this
 * off my shelf」 is not 「destroy it for everyone on the trip」. The row is
 * pruned from the trip it belonged to when that trip next pushes — which is
 * the traveller's own list — and nothing else is touched.
 *
 * Lifted automatically when the place is saved again: `reconcileDeletedSavedPlaces`
 * is driven off the list itself, so a place that is present is by definition
 * not deleted. That keeps the rule out of every save path.
 */
import { SavedTravelInspiration } from '../types';
import { inspirationKey } from './inspirationMerge';

export const DELETED_SAVED_PLACES_STORAGE_KEY = 'trippie_deleted_saved_places_v1';

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_SAVED_PLACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string' && Boolean(key))
      : [];
  } catch {
    return [];
  }
};

const write = (keys: string[]): void => {
  try {
    // Capped and newest-kept: a list of refusals, not a history.
    localStorage.setItem(DELETED_SAVED_PLACES_STORAGE_KEY, JSON.stringify(keys.slice(-500)));
  } catch {
    /*
      A blocked store costs the place reappearing on the next sync, which is
      the behaviour this replaces — bad, but not worse, and never worth losing
      the delete itself over.
    */
  }
};

export const deletedSavedPlaceKeys = (): string[] => read();

/** Written as the traveller deletes, whichever screen they deleted from. */
export const rememberDeletedSavedPlaces = (
  items: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>[],
): void => {
  const current = new Set(read());
  const before = current.size;
  items.forEach(item => {
    const key = inspirationKey(item);
    if (key) current.add(key);
  });
  if (current.size !== before) write(Array.from(current));
};

/**
 * What a sync may still put on the shelf.
 *
 * Applied to the server's copy before it replaces anything, so the place is
 * absent from the local list — which is also what makes the next push prune
 * the row: the prune deletes what this device had and no longer has.
 */
export const withoutDeletedSavedPlaces = <T extends Pick<SavedTravelInspiration, 'placeId' | 'placeName'>>(
  incoming: T[],
  deleted: string[] = read(),
): T[] => {
  if (deleted.length === 0) return incoming;
  const gone = new Set(deleted);
  return incoming.filter(item => !gone.has(inspirationKey(item)));
};

/**
 * Saving a place again is asking for it back, in as many words.
 *
 * Derived from the list rather than written by each save path: there are four
 * ways into the collection — screenshot, manual entry, somebody's published
 * trip, somebody's collection — and a rule repeated in four places is a rule
 * with four answers.
 */
export const reconcileDeletedSavedPlaces = (
  held: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>[],
): void => {
  const deleted = read();
  if (deleted.length === 0) return;
  const present = new Set(held.map(item => inspirationKey(item)));
  const remaining = deleted.filter(key => !present.has(key));
  if (remaining.length !== deleted.length) write(remaining);
};
