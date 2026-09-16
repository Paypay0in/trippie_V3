import { useEffect, useRef, useState } from 'react';
import { Expense, TripMember } from '../types';
import {
  TripSyncSnapshot,
  ensureTripRow,
  fetchTripSnapshot,
  isSyncAvailable,
  pushTripSnapshot,
} from '../services/tripSync';

/**
 * Keeps one open trip in step with the shared tables.
 *
 * Read once when the trip opens, then write the whole ledger, debounced, when
 * it changes. Writing the whole ledger rather than threading a push through
 * every handler is deliberate: create, edit, delete, raise a question, approve
 * a correction and revert one all mutate the same list, and a push wired into
 * six places is a push that will be missing from the seventh.
 *
 * The ordering rule that matters: never write before the first read has
 * finished. A push carries deletions, so pushing a freshly opened, still-empty
 * local trip over a populated remote one would erase everyone else's expenses
 * silently. `readyTripId` is what makes that impossible.
 */

export type TripSyncState = 'off' | 'loading' | 'synced' | 'error';

interface Options {
  tripId: string | null;
  authUserId?: string;
  tripName: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
  members: TripMember[];
  expenses: Expense[];
  /** Called when the trip already exists remotely and the remote copy wins. */
  onRemoteSnapshot: (snapshot: TripSyncSnapshot) => void;
}

const PUSH_DEBOUNCE_MS = 900;

export const useTripSync = ({
  tripId,
  authUserId,
  tripName,
  destination,
  startDate,
  endDate,
  currency,
  members,
  expenses,
  onRemoteSnapshot,
}: Options): TripSyncState => {
  const [state, setState] = useState<TripSyncState>('off');
  // The trip whose first read has completed. Pushes are refused for any other
  // trip, which covers both "not read yet" and "the user switched trips
  // mid-flight and the debounce is still holding the old list".
  const readyTripIdRef = useRef<string | null>(null);
  const onRemoteSnapshotRef = useRef(onRemoteSnapshot);
  onRemoteSnapshotRef.current = onRemoteSnapshot;

  const enabled = Boolean(tripId && authUserId && isSyncAvailable());

  useEffect(() => {
    readyTripIdRef.current = null;
    if (!enabled || !tripId || !authUserId) {
      setState('off');
      return;
    }

    let cancelled = false;
    setState('loading');

    (async () => {
      // Claimed by whoever opens it first; a member who is not the owner is
      // refused here and simply reads what the owner created.
      await ensureTripRow({
        tripId,
        ownerUserId: authUserId,
        name: tripName,
        destination,
        startDate,
        endDate,
        currency,
      });

      const remote = await fetchTripSnapshot(tripId);
      if (cancelled) return;

      if (remote.status === 'error') {
        // Silent failure is the trap here: the local ledger keeps working, so
        // nothing looks wrong while nothing is being shared.
        if (import.meta.env.DEV) console.warn('[tripSync] read failed', remote.message);
        setState('error');
        return;
      }
      if (remote.status === 'ok' && (remote.data.expenses.length || remote.data.members.length)) {
        onRemoteSnapshotRef.current(remote.data);
      }

      readyTripIdRef.current = tripId;
      setState('synced');
    })();

    return () => {
      cancelled = true;
    };
    // Trip identity and account only. Renaming a trip should not re-read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, authUserId, enabled]);

  // The roster and the expense list are rebuilt on every render, so depending
  // on the arrays themselves would restart the debounce forever and never
  // write. Comparing content also means an idle re-render costs no request.
  const payloadSignature = JSON.stringify({ members, expenses });
  const payloadRef = useRef({ members, expenses });
  payloadRef.current = { members, expenses };

  useEffect(() => {
    if (!enabled || !tripId || readyTripIdRef.current !== tripId) return;

    const timer = window.setTimeout(() => {
      const { members: m, expenses: e } = payloadRef.current;
      void pushTripSnapshot({ members: m, expenses: e }, tripId).then(result => {
        if (readyTripIdRef.current !== tripId) return;
        if (result.status === 'error' && import.meta.env.DEV) {
          console.warn('[tripSync] write failed', result.message);
        }
        setState(result.status === 'error' ? 'error' : 'synced');
      });
    }, PUSH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, tripId, payloadSignature]);

  return state;
};
