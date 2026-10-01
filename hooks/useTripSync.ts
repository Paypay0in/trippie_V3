import { useEffect, useRef, useState } from 'react';
import { Expense, FlightAnchor, ItineraryItem, TripMember } from '../types';
import {
  KnownRemoteIds,
  TripSyncSnapshot,
  ensureTripRow,
  fetchTripSnapshot,
  isSyncAvailable,
  pushTripSnapshot,
} from '../services/tripSync';
import { hasRemoteContent } from '../services/tripSnapshotApply';
import { nextKnownIds } from '../services/syncPrune';
import { mergeWithUnpushed } from '../services/syncMerge';

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
/**
 * How often an open trip goes back for the other person's changes.
 *
 * Twenty seconds is chosen against the situation this is for: two people at
 * the same table, one of them paying. Long enough that an idle phone is not
 * making a request a second, short enough that 「她記的帳呢」 is answered by
 * waiting rather than by reloading.
 */
const REREAD_INTERVAL_MS = 20_000;

/**
 * Whether the traveller asked for the sync panel, with `?sync=1`.
 *
 * Remembered for the rest of the browser session, because the answer has to
 * survive the taps it takes to reach the screen in question — the query string
 * is gone the moment the app navigates. `?sync=0` turns it back off.
 */
const SYNC_PANEL_KEY = 'trippie_sync_panel';

const requestedSyncPanel = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('sync');
    if (asked === '1') window.sessionStorage.setItem(SYNC_PANEL_KEY, '1');
    if (asked === '0') window.sessionStorage.removeItem(SYNC_PANEL_KEY);
    return window.sessionStorage.getItem(SYNC_PANEL_KEY) === '1';
  } catch {
    // Private mode denies sessionStorage. The query string still answers for
    // this page, which is enough to take one screenshot.
    try {
      return new URLSearchParams(window.location.search).get('sync') === '1';
    } catch {
      return false;
    }
  }
};

/** A short, screenshot-legible id. The full uuid wraps and reads as noise. */
const shortId = (value?: string | null): string => (value ? `${value.slice(0, 8)}…` : '—');

const clockNow = (): string => new Date().toLocaleTimeString('zh-TW', { hour12: false });

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
  /** Bumped to force a push that no content change would have triggered. */
  const [publishRevision, setPublishRevision] = useState(0);
  // What the panel shows under `?sync=1`: which trip and account this device is
  // on, and what the last read and the last write actually carried. Two phones
  // showing 「正常」 while sharing nothing differ somewhere in these numbers.
  const [detail, setDetail] = useState('');
  // The trip whose first read has completed. Pushes are refused for any other
  // trip, which covers both "not read yet" and "the user switched trips
  // mid-flight and the debounce is still holding the old list".
  const readyTripIdRef = useRef<string | null>(null);
  const onRemoteSnapshotRef = useRef(onRemoteSnapshot);
  onRemoteSnapshotRef.current = onRemoteSnapshot;

  const enabled = Boolean(tripId && authUserId && isSyncAvailable());

  /**
   * What this device knows is on the server.
   *
   * The push used to delete every row not in the list it was sending, which
   * on a second phone deletes the other traveller's expenses — they are
   * absent because this device has not re-read, not because anyone removed
   * them. Only ids in here may be deleted, so a record created elsewhere
   * survives a push that has never seen it.
   */
  const knownRef = useRef<KnownRemoteIds>({ members: new Set<string>(), expenses: new Set<string>(), itinerary: new Set<string>(), flightAnchors: new Set<string>() });

  // The last read and the last write, kept as text because that is all the
  // panel does with them.
  const lastReadRef = useRef('尚未讀取');
  const lastWriteRef = useRef('尚未寫入');

  const countsOf = (snapshot: TripSyncSnapshot): string =>
    `成員${snapshot.members.length}・帳${snapshot.expenses.length}・行程${snapshot.itinerary.length}・航班${snapshot.flightAnchors.length}`;

  const refreshDetail = () => {
    setDetail(
      [
        `旅程 ${shortId(tripId)}｜帳號 ${shortId(authUserId)}`,
        `讀取 ${lastReadRef.current}`,
        `寫入 ${lastWriteRef.current}`,
      ].join('\n'),
    );
  };

  const rememberRemote = (snapshot: TripSyncSnapshot) => {
    knownRef.current = {
      members: new Set(snapshot.members.map(member => member.id)),
      expenses: new Set(snapshot.expenses.map(expense => expense.id)),
      itinerary: new Set(snapshot.itinerary.map(item => item.id)),
      flightAnchors: new Set(snapshot.flightAnchors.map(anchor => anchor.id)),
    };
  };

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
        lastReadRef.current = `${clockNow()} 失敗 — ${remote.message}`;
        refreshDetail();
        setState('error');
        return;
      }
      if (remote.status === 'ok' && hasRemoteContent(remote.data)) {
        onRemoteSnapshotRef.current(remote.data);
      }
      if (remote.status === 'ok') {
        rememberRemote(remote.data);
        lastReadRef.current = `${clockNow()} 開啟時 ${countsOf(remote.data)}`;
        refreshDetail();
      }

      readyTripIdRef.current = tripId;
      /*
        Publish once on every open.

        A push fires when the ledger changes, which leaves a record whose first
        push failed with nothing to ride on: the content is already local, the
        re-read merges it back unchanged, and the signature never moves again.
        The expense she recorded while the server was refusing her writes sat on
        her phone for an hour that way, and the only way out was to go and edit
        it until something looked different.

        This is an upsert of what this device is already holding, against a
        snapshot it has just read, so it adds nothing and prunes nothing.
      */
      setPublishRevision(current => current + 1);
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
      void pushTripSnapshot({ members: m, expenses: e, itinerary: i, flightAnchors: f }, tripId, knownRef.current).then(result => {
        if (readyTripIdRef.current !== tripId) return;
        if (result.status !== 'error') {
          // What was just written is now known, and what was deleted stops
          // being — otherwise a later push would try to delete it again, and
          // would destroy a row someone else recreated under the same id.
          knownRef.current = {
            members: nextKnownIds(knownRef.current.members ?? [], m.map(member => member.id)),
            expenses: nextKnownIds(knownRef.current.expenses, e.map(expense => expense.id)),
            itinerary: nextKnownIds(knownRef.current.itinerary, i.map(item => item.id)),
            flightAnchors: nextKnownIds(knownRef.current.flightAnchors, f.map(anchor => anchor.id)),
          };
        }
        if (result.status === 'error') {
          if (import.meta.env.DEV) console.warn('[tripSync] write failed', result.message);
          setFailure(`寫入：${result.message}`);
          lastWriteRef.current = `${clockNow()} 失敗 — ${result.message}`;
        } else {
          lastWriteRef.current = `${clockNow()} ${countsOf(payloadRef.current)}`;
        }
        refreshDetail();
        setState(result.status === 'error' ? 'error' : 'synced');
      });
    }, PUSH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, tripId, payloadSignature, publishRevision]);

  /**
   * Re-read while the trip is open, so the other person's records arrive.
   *
   * The read above runs once per trip. Everything after it was a write, so a
   * device only ever learned what the other traveller had done by being
   * reopened — 「他記帳我的有出現，但我記帳她的沒出現」 was simply whichever
   * phone had been restarted more recently.
   *
   * On focus and on an interval, because the two catch different things: a
   * phone picked up after lunch, and a phone left open on the table while the
   * other person pays.
   */
  useEffect(() => {
    if (!enabled || !tripId) return;

    let inFlight = false;
    const reread = async () => {
      // Never while a push is pending or the first read has not landed: both
      // would reorder a write against a read.
      if (inFlight || readyTripIdRef.current !== tripId) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const remote = await fetchTripSnapshot(tripId);
        if (readyTripIdRef.current !== tripId) return;
        if (remote.status === 'ok' && hasRemoteContent(remote.data)) {
          // Merged, not applied. Applying a snapshot replaces the local list,
          // and this one arrives while the trip is being edited — a read
          // landing between a new record and the push that carries it would
          // wipe it off its author's own screen.
          const local = payloadRef.current;
          const known = knownRef.current;
          const merged: TripSyncSnapshot = {
            members: remote.data.members,
            expenses: mergeWithUnpushed(local.expenses, remote.data.expenses, known.expenses),
            itinerary: mergeWithUnpushed(local.itinerary, remote.data.itinerary, known.itinerary),
            flightAnchors: mergeWithUnpushed(local.flightAnchors, remote.data.flightAnchors, known.flightAnchors),
          };
          onRemoteSnapshotRef.current(merged);
          // Only what the server actually confirmed becomes known. Marking a
          // still-unpushed local record as known would let the next push
          // delete it.
          rememberRemote(remote.data);
          lastReadRef.current = `${clockNow()} 重讀 ${countsOf(remote.data)}`;
          refreshDetail();
        } else if (remote.status === 'error') {
          lastReadRef.current = `${clockNow()} 重讀失敗 — ${remote.message}`;
          refreshDetail();
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(reread, REREAD_INTERVAL_MS);
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', reread);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', reread);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tripId]);

  // Even before the first read lands, the panel must say which trip and which
  // account this device is on — that alone settles most of 「沒有同步」.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refreshDetail(); }, [tripId, authUserId]);

  useSyncBadge(state, { tripId, signedIn: Boolean(authUserId), failure, note, detail });

  return state;
};

/**
 * The sync status banner, attached straight to the document.
 *
 * Rendering it as JSX put it on exactly one of App's fourteen return paths, so
 * it was invisible on the very screen it was meant to report on. Living outside
 * the component tree means it cannot be missed off a branch again.
 *
 * A failure shows in production too. It was dev-only, which meant a traveller
 * whose writes were being rejected saw an app that looked entirely normal —
 * and so did anyone they asked for help. A ledger silently not saving is the
 * one thing this app must never do quietly.
 *
 * The off state stays dev-only: signed out is an ordinary way to use this, and
 * a permanent grey bar is a cost paid on every screen for a fact that matters
 * on almost none.
 */
const useSyncBadge = (
  state: TripSyncState,
  { tripId, signedIn, failure, note, detail }: { tripId: string | null; signedIn: boolean; failure: string; note?: string; detail?: string },
) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const id = 'trippie-sync-badge';
    const existing = document.getElementById(id);
    // `?sync=1` forces it on, including when everything reports healthy.
    //
    // 「都沒有同步到彼此手機」 cannot be diagnosed from two screens that both
    // look fine. The facts that settle it — which trip each device is on, how
    // many records the server returned — are known here and were shown
    // nowhere, so every round of this was guesswork. Two screenshots end it.
    const forced = requestedSyncPanel();
    // Errors everywhere; the rest only while developing.
    const quiet = !forced && (state === 'synced' || state === 'loading' || (state !== 'error' && !import.meta.env.DEV));
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
      synced: ['#dcfce7', '#166534', '正常'],
      loading: ['#e0e7ff', '#3730a3', '讀取中'],
    };
    const [background, color, label] = look[state] ?? ['#e2e8f0', '#475569', state];
    node.style.background = background;
    node.style.color = color;
    node.textContent = `雲端同步：${label}${note ? ` ｜ ${note}` : ''}${forced && detail ? `\n${detail}` : ''}`;

    if (!node.isConnected) document.body.appendChild(node);
    return () => node.remove();
  }, [state, tripId, signedIn, failure, note, detail]);
};
