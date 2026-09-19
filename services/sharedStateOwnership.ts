/**
 * Who owns a piece of shared trip state: the database, or the socket.
 *
 * Both exist, and for a while both wrote. The socket broadcasts a whole
 * trip-state blob to everyone in the room; the cloud sync pushes the whole
 * ledger and deletes anything missing from it. Put those together on two
 * phones and money disappears:
 *
 *   1. B adds an expense. The debounced push has not fired yet.
 *   2. A broadcasts its own state, which cannot contain B's new expense.
 *   3. B applies the broadcast and the expense vanishes from B's screen.
 *   4. B's push fires with the emptied list, and the prune deletes the row
 *      from the database.
 *
 * Gone from both phones and the server, silently, with no error anywhere.
 *
 * So: anything with a table behind it is the database's, and the socket may
 * not write it. Anything without one is still the socket's, because a
 * broadcast is the only sharing those fields have.
 *
 * This is the smallest correct fix rather than the best architecture. The
 * socket should eventually carry a nudge — "something changed, go and read"
 * — instead of state at all.
 */

/** Fields the shared tables are the source of truth for. */
export const CLOUD_OWNED_FIELDS = ['expenses', 'companions', 'itinerary'] as const;

/**
 * Whether the database is in charge of this trip's shared state right now.
 *
 * Both conditions matter. Without a signed-in account there are no
 * row-level-security grants and nothing syncs; without a configured client
 * there is no database at all. In either case the socket is the only sharing
 * there is, and gating it would leave two people with no way to see each
 * other's records.
 */
export const cloudOwnsSharedState = (
  { signedIn, syncAvailable }: { signedIn: boolean; syncAvailable: boolean },
): boolean => signedIn && syncAvailable;

/**
 * The fields of an incoming broadcast that may still be applied.
 *
 * Returns a copy rather than mutating: the caller is holding a payload that
 * arrived over the wire, and quietly editing it makes the next reader's
 * assumptions wrong.
 */
export const applicableBroadcastFields = <T extends Record<string, unknown>>(
  state: T,
  cloudOwns: boolean,
): Partial<T> => {
  if (!cloudOwns) return { ...state };
  const next: Partial<T> = {};
  (Object.keys(state) as Array<keyof T>).forEach(key => {
    if (!(CLOUD_OWNED_FIELDS as readonly string[]).includes(key as string)) {
      next[key] = state[key];
    }
  });
  return next;
};
