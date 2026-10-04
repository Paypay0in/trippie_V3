import { ClusterablePlace, distanceKm } from './placeClusters';

/**
 * A saved place that was bound to somewhere it cannot be.
 *
 * 「錯的就刪了（但要用戶知道）」. 다고소님 resolved to Danyang-gun in 忠清北道 —
 * 200km from Busan and from every other place on the list. The name came off a
 * screenshot that misread 단골손님, so the search had nothing real to find and
 * Google answered with its best guess; the pick bound it.
 *
 * Found as an outlier rather than against the trip's own coordinates, because a
 * trip entered as 「韓國」 has none: it is a country, and everything is inside
 * it. Distance to the nearest *other* saved place is the question that has an
 * answer — 機張 is 12km from 海雲台 and belongs to the trip, Danyang is 200km
 * from everything and belongs to a different week.
 */

/**
 * How far a place can sit from every other one and still be plausible.
 *
 * A day trip out of the city is 40–80km: 機張, 慶州, 統營 from Busan are all
 * real places to go. 200km is not a detour, it is a different trip — and on
 * this evidence it is a mis-pick rather than an ambition.
 */
export const MISPLACED_DISTANCE_KM = 120;

export interface MisplacedPlace<T extends ClusterablePlace = ClusterablePlace> {
  place: T;
  /** How far it is from the closest other saved place, in km. */
  distanceFromTripKm: number;
}

const located = <T extends ClusterablePlace>(place: T): place is T & { latitude: number; longitude: number } =>
  Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
  && !(place.latitude === 0 && place.longitude === 0);

/**
 * The saved places bound somewhere the rest of the trip is not.
 *
 * Needs at least three located places to say anything: with two, there is no
 * way to tell which of them is the outlier, and guessing would unbind the right
 * one half the time.
 */
export const findMisplacedPlaces = <T extends ClusterablePlace>(
  places: T[],
  maxDistanceKm: number = MISPLACED_DISTANCE_KM,
): MisplacedPlace<T>[] => {
  const withCoordinates = places.filter(located);
  if (withCoordinates.length < 3) return [];

  return withCoordinates.flatMap(place => {
    const nearest = withCoordinates
      .filter(other => other.id !== place.id)
      .reduce((closest, other) => Math.min(closest, distanceKm(place, other)), Number.POSITIVE_INFINITY);

    return nearest > maxDistanceKm
      ? [{ place, distanceFromTripKm: Math.round(nearest) }]
      : [];
  });
};

/**
 * Strips the map identity off a place, leaving what the traveller saved.
 *
 * The binding is the part that is provably wrong; the name came off their
 * screenshot and the notes came off the post they read. Clearing the identity
 * puts the row back to 「地圖上還沒找到這個地點」, where the search is offered
 * again — rather than deleting a record whose text was never the problem.
 */
export const withoutPlaceIdentity = <T extends {
  placeId?: string;
  resolvedPlaceName?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  placePhotoUrl?: string;
}>(place: T): T => ({
  ...place,
  placeId: undefined,
  resolvedPlaceName: undefined,
  formattedAddress: undefined,
  latitude: undefined,
  longitude: undefined,
  placePhotoUrl: undefined,
});
