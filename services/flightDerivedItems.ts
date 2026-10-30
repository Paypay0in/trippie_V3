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
import { locateAirports } from './flightIntake';

/*
  Why the words below are not translated.

  Every one of them is a field on an `ItineraryItem`: written to localStorage
  and pushed to Supabase, then read by a companion's phone, which never
  receives the anchor that produced it. Generating them in the writer's
  language would give one trip two languages depending on whose app derived
  the item last — and `fixedAnchorSchedule` already reads an item's role from
  its id prefix rather than its title, which is where a translated screen
  should read it too.
*/

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
  `flight-landing-${anchorId}`,
];

/**
 * The airport as a place, not only as a name.
 *
 * 「這個機票有明確的起降機場 行程表應該要做到自動帶入地點」 — and the card said
 * 「其中一個地點還沒連結地圖，無法計算交通時間」 under a flight whose ticket
 * printed TPE and NRT. Both ends were known: `FlightAnchor` has carried these
 * three fields all along and the derived items simply never copied them, so
 * every leg touching an airport was a leg with one unmapped end.
 */
const placeOf = (
  placeId?: string,
  latitude?: number,
  longitude?: number,
): Pick<ItineraryItem, 'placeId' | 'latitude' | 'longitude'> => ({
  ...(placeId ? { placeId } : {}),
  ...(typeof latitude === 'number' ? { latitude } : {}),
  ...(typeof longitude === 'number' ? { longitude } : {}),
});

export const itemsFromFlightAnchor = (rawAnchor: FlightAnchor): ItineraryItem[] => {
  /*
    Located here as well as on the way in, so a trip saved before the join
    existed heals itself the next time it renders.

    An anchor stored by an earlier build holds the IATA codes and no
    coordinates, and the alternative to this line is telling the traveller to
    delete and re-upload a ticket the app can already read. Nothing is written
    back — the lookup is a pure read of a table that ships with the app.
  */
  const anchor = locateAirports(rawAnchor);
  if (!anchor.departureDate || !anchor.departureTime || !anchor.departureAirport) return [];
  const [arrivalId, departureId, landingId] = derivedItemIdsFor(anchor.id);
  return [
    {
      id: arrivalId,
      time: shiftClock(anchor.departureTime, anchor.airportArrivalBufferMinutes || DEFAULT_AIRPORT_BUFFER_MINUTES),
      // i18n-data: ItineraryItem field, written to storage and synced; see note above
      title: '抵達機場',
      location: anchor.departureAirport,
      ...placeOf(anchor.departureAirportPlaceId, anchor.departureAirportLatitude, anchor.departureAirportLongitude),
      // i18n-data: ItineraryItem field, stored and synced; see note above
      notes: '依航班起飛時間與機場緩衝自動推算，於「航班資訊」修改',
      type: 'TRANSPORT',
      date: anchor.departureDate,
      isCompleted: false,
      derivedFromFlightAnchorId: anchor.id,
    },
    {
      id: departureId,
      time: anchor.departureTime,
      // i18n-data: ItineraryItem field, written to storage and synced; see note above
      title: '航班起飛',
      location: anchor.departureAirport,
      ...placeOf(anchor.departureAirportPlaceId, anchor.departureAirportLatitude, anchor.departureAirportLongitude),
      // i18n-data: ItineraryItem field, stored and synced; see note above
      notes: '由已保存航班錨點產生，於「航班資訊」修改',
      type: 'FLIGHT',
      date: anchor.departureDate,
      isCompleted: false,
      derivedFromFlightAnchorId: anchor.id,
    },
    // Landing, when the flight says when.
    //
    // The timeline held the two steps before take-off and then nothing until
    // the hotel — the moment the traveller actually reaches the country was
    // absent from the day it happens on. It also gives the transfer card
    // something to follow: land, clear the airport, ride in, check in.
    //
    // Dated by the arrival, which is not always the departure day.
    ...(anchor.arrivalTime ? [{
      id: landingId,
      time: anchor.arrivalTime,
      // i18n-data: ItineraryItem field, written to storage and synced; see note above
      title: '航班抵達',
      // i18n-data: ItineraryItem field, stored and synced; see note above
      location: anchor.arrivalAirport || anchor.arrivalAirportIata || '目的地機場',
      ...placeOf(anchor.arrivalAirportPlaceId, anchor.arrivalAirportLatitude, anchor.arrivalAirportLongitude),
      // i18n-data: ItineraryItem field, stored and synced; see note above
      notes: '由已保存航班錨點產生，於「航班資訊」修改',
      type: 'FLIGHT' as const,
      date: anchor.arrivalDate || anchor.departureDate,
      isCompleted: false,
      derivedFromFlightAnchorId: anchor.id,
    }] : []),
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

/**
 * When each flight puts the traveller on the ground.
 *
 * Only anchors that state an arrival time qualify: a check-in derived from a
 * guessed landing would be a guess wearing a specific number.
 */
export const flightArrivals = (anchors: FlightAnchor[]): FlightArrivalPoint[] =>
  anchors.flatMap(anchor =>
    anchor.arrivalTime
      ? [{
          date: anchor.arrivalDate || anchor.departureDate,
          time: anchor.arrivalTime,
          airport: anchor.arrivalAirport || anchor.arrivalAirportIata,
          latitude: anchor.arrivalAirportLatitude,
          longitude: anchor.arrivalAirportLongitude,
        }]
      : [],
  );

export interface FlightArrivalPoint {
  date: string;
  time: string;
  /** Named so a route can be looked up when no coordinates were saved. */
  airport?: string;
  latitude?: number;
  longitude?: number;
}
