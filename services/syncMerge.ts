/**
 * Combining what the server has with what this device has not sent yet.
 *
 * Applying a remote snapshot replaces the local list outright. On open that is
 * correct — the local copy cannot know what anyone else did. While the trip is
 * open and being edited it is not: a read landing between a new record and the
 * debounced push that carries it wipes that record off its author's own screen,
 * before it has ever reached the server.
 *
 * Three cases, told apart by the same knowledge the prune uses — the ids this
 * device has read or written:
 *
 *   in remote                  -> take the remote copy, it is authoritative
 *   local only, never known    -> created here and not pushed yet, keep it
 *   local only, known before   -> someone else deleted it, let it go
 *
 * The third is why this cannot simply be a union: a deleted expense that comes
 * back is worse than one that disappears, because nobody is looking for it.
 */

/**
 * The list to show: everything remote, plus local records not yet pushed.
 *
 * Order follows remote first, then the local-only tail, so the common case —
 * nothing pending — is exactly the remote list.
 */
export const mergeWithUnpushed = <T extends { id: string }>(
  local: T[],
  remote: T[],
  knownIds: Iterable<string>,
  /**
   * What this device last successfully sent, when it is known.
   *
   * 「為什麼我點進去 上傳照片馬上就被刪掉了」 — the fourth case, and the one
   * this function did not have. Creations were protected; *edits* to records
   * the server already holds were not, so 「take the remote copy」 threw away
   * a change made a second earlier and not yet pushed.
   *
   * The photo picker is what made it constant rather than rare: opening it
   * hides the document, closing it fires `visibilitychange`, and the re-read
   * that fires on returning landed between the edit and the debounced push
   * every single time.
   *
   * So: a local record that differs from what was last pushed is newer than
   * anything the server can be showing, and wins until it has been sent.
   * Omitted entirely, this behaves exactly as it always did.
   */
  lastPushed?: readonly T[],
): T[] => {
  const remoteIds = new Set(remote.map(item => item.id));
  const known = new Set(knownIds);

  const unpushed = local.filter(item => !remoteIds.has(item.id) && !known.has(item.id));
  if (!lastPushed) return [...remote, ...unpushed];

  const sentAs = new Map(lastPushed.map(item => [item.id, JSON.stringify(item)]));
  const localById = new Map(local.map(item => [item.id, item]));
  const merged = remote.flatMap(item => {
    const mine = localById.get(item.id);
    const sent = sentAs.get(item.id);
    if (!mine) {
      /*
        Gone from here, and this device put it there.

        「我按刪除 全部又回來」 — deleting is two steps, the removal and the
        prune that carries it, and a read landing between them found the row
        still on the server and handed it back. The row then looked like
        something this device had never heard of, so the prune had nothing to
        remove and it stayed.

        An id this device pushed and no longer holds is a deletion in flight.
        A row absent from `lastPushed` is one somebody else added since, and
        is taken as it comes.
      */
      return sent === undefined ? [item] : [];
    }
    /*
      Never seen in a push is not an edit — it is a record this device has
      only ever read, and the server's copy is the only word on it.
    */
    if (sent === undefined) return [item];
    return [JSON.stringify(mine) === sent ? item : mine];
  });
  return [...merged, ...unpushed];
};
