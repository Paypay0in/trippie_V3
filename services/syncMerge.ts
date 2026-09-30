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
): T[] => {
  const remoteIds = new Set(remote.map(item => item.id));
  const known = new Set(knownIds);

  const unpushed = local.filter(item => !remoteIds.has(item.id) && !known.has(item.id));
  return [...remote, ...unpushed];
};
