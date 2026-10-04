import { ItineraryItem } from '../types';
import { ClusterablePlace, clusterSavedPlaces, PlaceCluster } from './placeClusters';

/**
 * The trip's areas, computed once from everything that has a location.
 *
 * 「行程就需要也有分顏色 讓用戶知道大行程在哪區」. The collection already groups by
 * area; the plan is where the grouping actually pays off, because that is where
 * a day gets built. A 海雲台 card and a 海雲台 saved place must wear the same
 * colour, or the colour means one thing on one screen and another on the next.
 *
 * So both lists are clustered together rather than separately. The alternative
 * — each screen clustering its own — gives 廣安里 purple in the collection and
 * blue on the plan the moment one list contains a place the other does not,
 * which is most of the time.
 *
 * Ids are prefixed on the way in and matched on the way out, so an itinerary
 * item and a saved place for the same restaurant stay two rows that happen to
 * share an area, rather than being folded into one thing.
 */

export const ITINERARY_PREFIX = 'item:';
export const INSPIRATION_PREFIX = 'insp:';

export interface AreaSource {
  itinerary?: ItineraryItem[];
  inspirationGroups?: Array<{
    id: string;
    placeName: string;
    coordinates?: { latitude: number; longitude: number };
    formattedAddress?: string;
  }>;
}

/** Everything on the trip that knows where it is, in one list. */
export const tripAreaInputs = ({ itinerary = [], inspirationGroups = [] }: AreaSource): ClusterablePlace[] => [
  ...itinerary.map(item => ({
    id: `${ITINERARY_PREFIX}${item.id}`,
    placeName: item.location || item.title,
    latitude: item.latitude,
    longitude: item.longitude,
    formattedAddress: item.address,
  })),
  ...inspirationGroups.map(group => ({
    id: `${INSPIRATION_PREFIX}${group.id}`,
    placeName: group.placeName,
    latitude: group.coordinates?.latitude,
    longitude: group.coordinates?.longitude,
    formattedAddress: group.formattedAddress,
  })),
];

export interface TripAreas {
  clusters: PlaceCluster[];
  /** The area a given itinerary item is in, if it has a location at all. */
  areaOfItem: (itemId: string) => PlaceCluster | undefined;
  /** The area a given saved-place group is in. */
  areaOfInspiration: (groupId: string) => PlaceCluster | undefined;
}

export const buildTripAreas = (source: AreaSource): TripAreas => {
  const { clusters } = clusterSavedPlaces(tripAreaInputs(source));

  const byMemberId = new Map<string, PlaceCluster>();
  clusters.forEach(cluster => {
    cluster.places.forEach(place => byMemberId.set(place.id, cluster));
  });

  return {
    clusters,
    areaOfItem: (itemId: string) => byMemberId.get(`${ITINERARY_PREFIX}${itemId}`),
    areaOfInspiration: (groupId: string) => byMemberId.get(`${INSPIRATION_PREFIX}${groupId}`),
  };
};
