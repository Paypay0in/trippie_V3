/**
 * Which rows a push is allowed to delete.
 *
 * The push wrote the whole ledger and then deleted everything on the server
 * that was not in it. On one device that is correct. On two it destroys money:
 *
 *   1. A records an expense. It reaches the server.
 *   2. B has not re-read since opening the trip, so B's list does not have it.
 *   3. B records an expense of their own. B's push upserts it — and then
 *      deletes every row not in B's list, which includes A's.
 *
 * A's expense is gone from the server, with no error, on a screen where it
 * still appears until the next reload. This is the same hazard the socket was
 * locked out of `sharedStateOwnership` for, arriving through the other door.
 *
 * The fix is to invert the question. "Delete everything I do not have" assumes
 * this device knows the whole trip, which a device that reads once and then
 * only writes never does. "Delete the things I had and deliberately removed"
 * assumes only that it remembers its own actions, which is true.
 */

/**
 * Ids to delete: the ones this device was holding and no longer is.
 *
 * Anything created elsewhere since the last read is in neither list, so it is
 * never deleted — it survives precisely because this device does not know
 * about it, which is the correct reason.
 */
export const idsToPrune = (knownIds: Iterable<string>, currentIds: Iterable<string>): string[] => {
  const current = new Set(currentIds);
  const pruned = new Set<string>();
  for (const id of knownIds) {
    if (id && !current.has(id)) pruned.add(id);
  }
  return Array.from(pruned);
};

/**
 * What this device knows about after a push.
 *
 * Everything it just wrote, plus what it had read before. Ids it deleted drop
 * out: keeping them would make a later push try to delete them again, and a
 * row someone else recreated under the same id would be destroyed by it.
 */
export const nextKnownIds = (knownIds: Iterable<string>, currentIds: Iterable<string>): Set<string> => {
  const next = new Set<string>();
  const current = new Set(currentIds);
  for (const id of knownIds) if (current.has(id)) next.add(id);
  for (const id of current) if (id) next.add(id);
  return next;
};
