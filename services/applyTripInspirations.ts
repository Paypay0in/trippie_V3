import { SavedTravelInspiration } from '../types';
import { mergeTripInspirations } from './inspirationMerge';

/**
 * The trip's saved places, as the server now has them.
 *
 * 「這也刪掉過了又出現」. 「打車 10 分鐘」 was removed and came back, because this
 * one list was applied differently from everything else on the trip: expenses
 * and the itinerary are replaced by the server's copy on every read, while
 * saved places were merged into the local ones. A merge has no way to express a
 * deletion — the entry was gone from the server and still present locally, so
 * it was treated as something the server had not heard about yet, and published
 * again.
 *
 * The asymmetry existed for a real reason: this store holds every trip the
 * traveller has ever saved a place for, and a snapshot only knows about one. So
 * the replacement is scoped — the places belonging to this trip become exactly
 * what the server says, and the rest are untouched.
 */
export const applyTripInspirations = (
  current: SavedTravelInspiration[],
  remote: SavedTravelInspiration[],
  belongsToTrip: (inspiration: SavedTravelInspiration) => boolean,
): SavedTravelInspiration[] => {
  const otherTrips = current.filter(inspiration => !belongsToTrip(inspiration));
  /*
    Folded on the way in, for the same reason the merge did it: two phones
    saving the same restaurant is the normal case, and the server can hold both
    until one of them is folded away.
  */
  const thisTrip = mergeTripInspirations(remote);

  // Order follows the local list where it can, so applying a snapshot does not
  // reshuffle a list somebody is reading.
  const position = new Map(current.map((inspiration, index) => [inspiration.id, index]));
  const ordered = [...thisTrip].sort((left, right) =>
    (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER));

  return [...otherTrips, ...ordered];
};
