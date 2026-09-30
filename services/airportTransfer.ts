/**
 * The ride from the airport to the room, kept in step with both ends.
 *
 * This card was first created once, at the moment a booking was added. So
 * entering a landing time afterwards changed nothing, and the only way to see
 * it was to delete the stay and add it again — which is asking the traveller
 * to work around the shape of the code.
 *
 * It is derived instead, the way a flight anchor already derives its airport
 * cards: whenever a flight or a stay changes, the transfer is rebuilt from
 * whatever the two of them now say.
 */

import { ItineraryItem } from '../types';
import { FlightArrivalPoint } from './flightDerivedItems';
import { StaySpan } from './stayIntake';
import { airportTransferItem, departAirportTime, reachHotelTime } from './arrivalPlan';

/** Marks a card this module owns, so reconciliation can replace its own work. */
export const TRANSFER_ID_PREFIX = 'airport-transfer-';

export const transferIdFor = (arrivalDate: string): string => `${TRANSFER_ID_PREFIX}${arrivalDate}`;

export interface TransferEstimate {
  travelSeconds?: number;
  mode?: 'DRIVE' | 'TRANSIT';
}

/**
 * The airport-to-hotel pairs worth asking about: a landing and a stay
 * beginning the same day.
 *
 * Keyed by date because that is what makes them the same journey. A landing
 * with no stay that day has nowhere to go, and a stay with no landing was
 * reached some other way.
 */
export const transferPairs = (
  arrivals: FlightArrivalPoint[],
  stays: StaySpan[],
): Array<{ arrival: FlightArrivalPoint; stay: StaySpan }> =>
  arrivals.flatMap(arrival => {
    if (!arrival.time) return [];
    const stay = stays.find(candidate => candidate.checkInDate === arrival.date);
    return stay ? [{ arrival, stay }] : [];
  });

/**
 * The transfer cards that should exist, replacing any this module made before.
 *
 * Items the traveller created are untouched. Ids are derived from the arrival
 * date so rebuilding updates the same card rather than stacking another one
 * beside it every time a time is edited.
 */
export const reconcileTransfers = (
  current: ItineraryItem[],
  pairs: Array<{ arrival: FlightArrivalPoint; stay: StaySpan }>,
  estimateFor: (key: string) => TransferEstimate | undefined,
  estimateKey: (pair: { arrival: FlightArrivalPoint; stay: StaySpan }) => string,
): ItineraryItem[] => {
  const kept = current.filter(item => !item.id.startsWith(TRANSFER_ID_PREFIX));

  const rebuilt = pairs.flatMap(pair => {
    const departTime = departAirportTime(pair.arrival.time);
    if (!departTime) return [];
    const estimate = estimateFor(estimateKey(pair)) ?? {};
    return [airportTransferItem({
      id: transferIdFor(pair.arrival.date),
      date: pair.arrival.date,
      departTime,
      airportName: pair.arrival.airport || '機場',
      hotelName: pair.stay.name,
      travelSeconds: estimate.travelSeconds,
      mode: estimate.mode,
    }) as ItineraryItem];
  });

  const next = [...kept, ...rebuilt];
  const unchanged =
    next.length === current.length
    && next.every((item, index) => JSON.stringify(item) === JSON.stringify(current[index]));
  return unchanged ? current : next;
};

/**
 * The hour a check-in should move to, or nothing if it should be left alone.
 *
 * Only a check-in still sitting on the uninformed default is adjusted. Once a
 * traveller has moved that card — and these cards are deliberately movable —
 * the time on it is a decision, and recomputing it every time a flight is
 * edited would quietly undo them.
 */
export const UNINFORMED_CHECK_IN_TIME = '15:00';

export const checkInTimeFromArrival = (
  currentTime: string,
  arrivalTime: string,
  travelSeconds?: number,
): string | undefined => {
  if (currentTime !== UNINFORMED_CHECK_IN_TIME) return undefined;
  const reached = reachHotelTime(arrivalTime, travelSeconds);
  return reached && reached !== currentTime ? reached : undefined;
};
