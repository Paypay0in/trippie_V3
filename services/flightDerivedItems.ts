/**
 * The itinerary items a flight anchor produces, and — the harder half — which
 * of them this device is allowed to remove.
 *
 * Flight anchors live on the trip object, which does not sync. The two items
 * each anchor derives (airport arrival, departure) go on the itinerary, which
 * does. So a companion receives the flight items without ever receiving the
 * anchor that explains them.
 *
 * The reconciliation that shipped removed every derived item before rebuilding
 * from the local anchors:
 *
 *     const kept = current.filter(item => !item.derivedFromFlightAnchorId);
 *
 * On a companion's phone the local anchor list is empty, so that rebuilt
 * nothing and dropped everything — and the sync push then pruned the same rows
 * from the shared trip. One traveller opening the app would erase the other's
 * flights for both of them.
 *
 * The fix is to distinguish "this anchor was deleted here" from "this anchor
 * was never mine". Only ids this device has actually held are eligible for
 * removal; anything derived from an unknown anchor belongs to someone else and
 * is left alone.
 */

import { FlightAnchor, ItineraryItem } from '../types';

/** Minutes before departure the traveller wants to be at the airport. */
const DEFAULT_AIRPORT_BUFFER_MINUTES = 120;

const shiftClock = (time: string, minutesEarlier: number): string => {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const total = Math.max(0, hours * 60 + minutes - minutesEarlier);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Ids are derived from the anchor rather than random so that re-deriving the
 * same anchor produces the same items, instead of a duplicate pair each time.
 */
export const derivedItemIdsFor = (anchorId: string): string[] => [
  `flight-arrival-${anchorId}`,
  `flight-departure-${anchorId}`,
];

export const itemsFromFlightAnchor = (anchor: FlightAnchor): ItineraryItem[] => {
  if (!anchor.departureDate || !anchor.departureTime || !anchor.departureAirport) return [];
  const [arrivalId, departureId] = derivedItemIdsFor(anchor.id);
  return [
    {
      id: arrivalId,
      time: shiftClock(anchor.departureTime, anchor.airportArrivalBufferMinutes || DEFAULT_AIRPORT_BUFFER_MINUTES),
      title: '抵達機場',
      location: anchor.departureAirport,
      notes: '依航班起飛時間與機場緩衝自動推算，於「航班資訊」修改',
      type: 'TRANSPORT',
      date: anchor.departureDate,
      isCompleted: false,
      derivedFromFlightAnchorId: anchor.id,
    },
    {
      id: departureId,
      time: anchor.departureTime,
      title: '航班起飛',
      location: anchor.departureAirport,
      notes: '由已保存航班錨點產生，於「航班資訊」修改',
      type: 'FLIGHT',
      date: anchor.departureDate,
      isCompleted: false,
      derivedFromFlightAnchorId: anchor.id,
    },
  ];
};

/**
 * Rebuilds the itinerary around the anchors this device holds.
 *
 * `knownAnchorIds` is every anchor id this device has ever managed, including
 * ones just deleted. An item derived from an id inside that set and no longer
 * in `anchors` was deleted here, so it goes. An item derived from an id outside
 * it arrived from another traveller and stays, untouched.
 */
export const reconcileFlightDerivedItems = (
  current: ItineraryItem[],
  anchors: FlightAnchor[],
  knownAnchorIds: ReadonlySet<string>,
): ItineraryItem[] => {
  const liveAnchorIds = new Set(anchors.map(anchor => anchor.id));

  const kept = current.filter(item => {
    const anchorId = item.derivedFromFlightAnchorId;
    if (!anchorId) return true;
    // Rebuilt below from the live anchor.
    if (liveAnchorIds.has(anchorId)) return false;
    // Deleted on this device, so it should go.
    if (knownAnchorIds.has(anchorId)) return false;
    // Someone else's flight. Not ours to remove.
    return true;
  });

  const derived = anchors.flatMap(itemsFromFlightAnchor);

  // Completion is the traveller's, not the anchor's: re-deriving must not
  // untick an item they already checked off.
  const completedIds = new Set(current.filter(item => item.isCompleted).map(item => item.id));
  const rebuilt = derived.map(item =>
    completedIds.has(item.id) ? { ...item, isCompleted: true } : item,
  );

  const next = [...kept, ...rebuilt];
  // Returning the same reference when nothing moved keeps this out of the
  // render/sync loop it sits inside.
  const unchanged =
    next.length === current.length && next.every((item, index) => item === current[index]);
  return unchanged ? current : next;
};
