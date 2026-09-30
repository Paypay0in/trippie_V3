import { TripSyncSnapshot } from './tripSync';

/**
 * Whether a snapshot read from the cloud is worth applying.
 *
 * A second device opens a trip holding an empty local shell, so applying an
 * empty snapshot over it changes nothing — but *discarding* a non-empty one
 * leaves the traveller looking at an empty trip while the data sits in the
 * database. That is indistinguishable from sync being broken, and it is what
 * happened to flights: `flightAnchors` was left out of this check, so a trip
 * whose cloud copy held only flights had its whole snapshot thrown away.
 *
 * Kept as a named function rather than a condition inline in the hook so the
 * next field added to a snapshot has an obvious place to be remembered, and a
 * test that says what happens when it is forgotten.
 */
export const hasRemoteContent = (snapshot: TripSyncSnapshot): boolean =>
  snapshot.expenses.length > 0
  || snapshot.members.length > 0
  || snapshot.itinerary.length > 0
  || snapshot.flightAnchors.length > 0;
