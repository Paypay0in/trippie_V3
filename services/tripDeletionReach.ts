/**
 * How far a delete should reach.
 *
 * 「這個我已經刪除了」 — about three trips that had been deleted and had come
 * back. The tombstone added earlier stops them returning to this device, and
 * that is the right answer for exactly one case: a trip somebody else is also
 * on. There, 「remove this from my phone」 and 「destroy this」 are different
 * requests, and performing the second when asked the first would take out the
 * ledger a travelling companion is still settling from.
 *
 * For a trip that is yours and has nobody else on it, those two requests are
 * the same request, and refusing it locally while the row lives on is not
 * caution — it is the delete not happening. It stays on the laptop, and the
 * next sign-in there offers it back.
 */

export interface DeletionSubject {
  /** The account that owns the trip, if the device knows it. */
  ownerId?: string;
  /** Everyone else on the trip. */
  companions?: { id: string }[];
}

export type DeletionReach =
  /** Delete the row: it is yours and yours alone. */
  | 'cloud'
  /** Forget it here only: somebody else's, or shared with somebody. */
  | 'device';

export const tripDeletionReach = (
  trip: DeletionSubject,
  viewerUserId: string | undefined,
  options: { syncAvailable?: boolean } = {},
): DeletionReach => {
  // Not signed in, or no cloud to delete from: the local list is all there is.
  if (!viewerUserId || options.syncAvailable === false) return 'device';

  /*
    An unowned trip is one this device made before anybody signed in. There is
    no row to delete and no co-traveller to protect.
  */
  if (!trip.ownerId) return 'device';

  // Somebody else's trip. Leaving is yours to do; deleting is not.
  if (trip.ownerId !== viewerUserId) return 'device';

  // Yours, but shared. The row belongs to everyone on it now.
  if ((trip.companions || []).length > 0) return 'device';

  return 'cloud';
};
