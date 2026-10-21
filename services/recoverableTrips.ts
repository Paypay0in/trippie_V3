/**
 * Trips the cloud still has that this device refuses to show.
 *
 * 「釜山的旅冊怎麼都不見了」 — not under another name, not in 已完成的旅程.
 *
 * The sign-in merge adds every cloud trip this device is missing, with one
 * deliberate exception: a trip deleted here is never put back. That rule
 * exists because of 「我已全部都刪掉過了 但又一直出現」, and it is right — but
 * it is also silent, and a silent refusal and a lost trip look identical from
 * the outside. One of them is recoverable and the other is not, and the
 * traveller is the only person who can tell them apart.
 *
 * So the refusal gets said out loud, and only when there is something behind
 * it. This does not undo the deletion; it reports that the cloud still holds
 * something this device is choosing not to show, and lets the traveller ask
 * for it back in as many words — which is exactly what `forgetDeletedTrip`
 * was written for.
 */
import { RemoteTripSummary } from './tripSync';

export interface RecoverableTrip {
  id: string;
  name: string;
  destination?: string;
  startDate: string;
  endDate: string;
  currency?: string;
  ownerId?: string;
}

/**
 * The cloud's trips that are neither on this device nor shown to it.
 *
 * Deliberately not 「every cloud trip this device lacks」: the merge beside
 * this already adds those, so listing them would offer the traveller a button
 * for something that is about to happen anyway. What is left is the set the
 * merge will never act on.
 */
export const recoverableTrips = (
  cloud: RemoteTripSummary[],
  localIds: string[],
  deletedIds: string[],
): RecoverableTrip[] => {
  if (deletedIds.length === 0) return [];
  const here = new Set(localIds);
  const refused = new Set(deletedIds);
  return cloud
    .filter(trip => refused.has(trip.id) && !here.has(trip.id))
    .map(trip => ({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      currency: trip.currency,
      ownerId: trip.ownerId || undefined,
    }));
};

/**
 * 2026/10/02 – 10/06, or nothing at all.
 *
 * A trip with no dates on the server shows none here rather than a blank
 * pair of dashes that reads like a loading state.
 */
export const recoverableDates = (trip: RecoverableTrip): string => {
  const parts = [trip.startDate, trip.endDate].filter(Boolean);
  return parts.length === 2 ? `${parts[0]} – ${parts[1]}` : parts[0] || '';
};
