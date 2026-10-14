import { SavedTravelInspiration } from '../types';
import { inspirationKey, mergeTripInspirations } from './inspirationMerge';

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
/**
 * Fields this device knows and the server has never been told about.
 *
 * 「有出現 但又消失了 沒有穩定存在」 and 「還是沒改呀」 — one cause, and it was never
 * the rendering. `trip_inspirations` has no column for the 🏷️ tag, for the
 * ward, or for the lookup stamp, so `fromTripInspirationRow` rebuilds every
 * record without them. Applying a snapshot then wiped all three:
 *
 *   補齊 writes 餐廳   → the chip appears
 *   the next pull      → the server's copy has no category → the chip is gone
 *
 * forever, whatever the rendering did. It also wiped `district`, which is why
 * an area heading kept reverting, and `placeResolvedAt`, which is why 補齊 kept
 * offering the same places and its count never finished.
 *
 * This file already states the rule for the list as a whole: 「undefined means
 * the server has not got the table yet and has said nothing, which is not the
 * same as saying the list is empty」. A column that does not exist says nothing
 * about these fields either, so the local value stands.
 *
 * The honest fix is columns — 0028 — but migrations 0022–0027 are still unrun,
 * and wiring a column before it exists breaks sync on both phones. This holds
 * until then, and stays correct afterwards: once the server does carry a value
 * it wins, because it is only the blank that falls back.
 */
const keepLocalOnlyFields = (current: SavedTravelInspiration[]) => {
  const byKey = new Map(current.map(inspiration => [inspirationKey(inspiration), inspiration]));
  return (incoming: SavedTravelInspiration): SavedTravelInspiration => {
    const local = byKey.get(inspirationKey(incoming));
    if (!local) return incoming;
    return {
      ...incoming,
      category: incoming.category || local.category,
      categoryRules: incoming.category ? incoming.categoryRules : local.categoryRules,
      district: incoming.district || local.district,
      placeResolvedAt: incoming.placeResolvedAt || local.placeResolvedAt,
    };
  };
};

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
  const thisTrip = mergeTripInspirations(remote).map(keepLocalOnlyFields(current));

  // Order follows the local list where it can, so applying a snapshot does not
  // reshuffle a list somebody is reading.
  const position = new Map(current.map((inspiration, index) => [inspiration.id, index]));
  const ordered = [...thisTrip].sort((left, right) =>
    (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.id) ?? Number.MAX_SAFE_INTEGER));

  return [...otherTrips, ...ordered];
};
