import { useEffect, useRef, useState } from 'react';
import { Expense, FlightAnchor, ItineraryItem, TripMember } from '../types';
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
  /**
   * The itinerary. Pushed on the same debounce as the ledger so one trip is
   * one write, and so the rule that nothing is written before the first read
   * completes covers the plan as well as the money.
   */
  itinerary: ItineraryItem[];
  /** The flights, carried on the same write as the rest of the trip. */
  flightAnchors: FlightAnchor[];
  /** Extra text for the dev banner, e.g. how many cloud trips were found. */
  note?: string;
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
  itinerary,
  flightAnchors,
  note,
  onRemoteSnapshot,
}: Options): TripSyncState => {
  const [state, setState] = useState<TripSyncState>('off');
  // The failure text, kept so the badge can show it. A red badge that will not
  // say why costs another round trip with someone who cannot open a console.
  const [failure, setFailure] = useState('');
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
        setFailure(`讀取：${remote.message}`);
        setState('error');
        return;
      }
      if (remote.status === 'ok'
        && (remote.data.expenses.length || remote.data.members.length || remote.data.itinerary.length)) {
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
  const payloadSignature = JSON.stringify({ members, expenses, itinerary, flightAnchors });
  const payloadRef = useRef({ members, expenses, itinerary, flightAnchors });
  payloadRef.current = { members, expenses, itinerary, flightAnchors };

  useEffect(() => {
    if (!enabled || !tripId || readyTripIdRef.current !== tripId) return;

    const timer = window.setTimeout(() => {
      const { members: m, expenses: e, itinerary: i, flightAnchors: f } = payloadRef.current;
      void pushTripSnapshot({ members: m, expenses: e, itinerary: i, flightAnchors: f }, tripId).then(result => {
        if (readyTripIdRef.current !== tripId) return;
        if (result.status === 'error') {
          if (import.meta.env.DEV) console.warn('[tripSync] write failed', result.message);
          setFailure(`寫入：${result.message}`);
        }
        setState(result.status === 'error' ? 'error' : 'synced');
      });
    }, PUSH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, tripId, payloadSignature]);

  useSyncBadge(state, { tripId, signedIn: Boolean(authUserId), failure, note });

  return state;
};

/**
 * Dev-only badge, attached straight to the document.
 *
 * Rendering it as JSX put it on exactly one of App's fourteen return paths, so
 * it was invisible on the very screen it was meant to report on. Living outside
 * the component tree means it cannot be missed off a branch again.
 */
const useSyncBadge = (
  state: TripSyncState,
  { tripId, signedIn, failure, note }: { tripId: string | null; signedIn: boolean; failure: string; note?: string },
) => {
  useEffect(() => {
    if (!import.meta.env.DEV || typeof document === 'undefined') return;

    // Only while something is wrong. The banner existed to find a sync bug that
    // is now fixed, and a permanent green bar across every screen is a cost the
    // reader pays on every page for information they need on almost none.
    const id = 'trippie-sync-badge';
    const existing = document.getElementById(id);
    const quiet = state === 'synced' || state === 'loading';
    if (quiet) {
      existing?.remove();
      return;
    }

    const node = existing ?? document.createElement('div');
    node.id = id;
    node.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 12px;text-align:center;' +
      'font:800 15px ui-monospace,monospace;pointer-events:none;white-space:pre-wrap';

    const look: Partial<Record<TripSyncState, [string, string, string]>> = {
      error: ['#ffe4e6', '#be123c', `失敗 — ${failure || '原因不明'}`],
      off: ['#e2e8f0', '#475569', `關閉（${!signedIn ? '未登入' : !tripId ? '沒有旅程' : '未設定'}）`],
    };
    const [background, color, label] = look[state] ?? ['#e2e8f0', '#475569', state];
    node.style.background = background;
    node.style.color = color;
    node.textContent = `雲端同步：${label}${note ? ` ｜ ${note}` : ''}`;

    if (!node.isConnected) document.body.appendChild(node);
    return () => node.remove();
  }, [state, tripId, signedIn, failure, note]);
};
