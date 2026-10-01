import React, { useEffect, useState } from 'react';
import { Check, Loader2, LogIn, Users } from 'lucide-react';
import { InvitePreview, claimInvite, inviteTokenFromUrl, previewInvite } from '../services/tripInvites';
import { claimFailureMessage } from '../services/inviteFailure';
import { getSession, subscribeToAuthChanges } from '../services/authService';

/**
 * What someone sees when they open an invite link.
 *
 * The person arriving is the one who knows least: they were sent a URL in a
 * message and may never have opened this app before. So the first thing shown
 * is who invited them to what, before anything is asked of them — a login
 * wall in front of an unexplained link is where people leave.
 *
 * The token outlives the sign-up. Registering means an email round trip and
 * quite possibly a different tab, and the invite has to survive that or the
 * friend lands in an empty app with no idea what went wrong. It is held in
 * sessionStorage, claimed the moment an account exists, and cleared the
 * moment it is used.
 *
 * Mounted beside App rather than inside it, and it watches the session
 * itself. App returns from more than a dozen places — signed out, no trip,
 * mid-flow — and an invite arrives at whichever of those the friend happens
 * to land on. A sheet living on one branch would be missing from the others,
 * which is the same mistake the sync badge was moved out of the tree to
 * avoid.
 */

/** Survives the sign-up round trip, and only for this tab. */
const PENDING_KEY = 'trippie_pending_invite';

/**
 * Asks the app to open its sign-in screen.
 *
 * This sheet is mounted beside App, not inside it, so it cannot reach the
 * navigation state — which is why it could tell the friend to sign in and
 * give her no way to do it. An event crosses that gap without either side
 * having to own the other.
 */
export const OPEN_SIGN_IN_EVENT = 'trippie:open-sign-in';

export const readPendingInvite = (search: string, storage: Storage | undefined): string | null => {
  const fromUrl = inviteTokenFromUrl(search);
  if (fromUrl) {
    try { storage?.setItem(PENDING_KEY, fromUrl); } catch { /* private mode */ }
    return fromUrl;
  }
  try { return storage?.getItem(PENDING_KEY) || null; } catch { return null; }
};

export const clearPendingInvite = (storage: Storage | undefined) => {
  try { storage?.removeItem(PENDING_KEY); } catch { /* private mode */ }
};

/**
 * The trip just joined, left for the app to open after the reload.
 *
 * Accepting an invite used to end in a reload and nothing else. The membership
 * was written, the trip appeared in the bookshelf, and the traveller was
 * returned to whatever she had open before — in the case this was found in,
 * her own empty 釜山, beside the shared 釜山 she had just been let into. Two
 * trips, one name, and nothing on screen saying anything had happened. She
 * spent three days believing sync was broken.
 *
 * localStorage, not sessionStorage: the reload is the point, and a claim that
 * completes in a tab opened from a messaging app must survive it.
 */
export const JOINED_KEY = 'trippie_joined_trip_id';

export const readJoinedTripId = (storage: Storage | undefined): string | null => {
  try { return storage?.getItem(JOINED_KEY) || null; } catch { return null; }
};

export const clearJoinedTripId = (storage: Storage | undefined) => {
  try { storage?.removeItem(JOINED_KEY); } catch { /* private mode */ }
};

/** Takes the invite out of the address bar without reloading or losing history. */
export const stripInviteFromUrl = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('join');
  window.history.replaceState({}, '', url.toString());
};

const JoinTripSheet: React.FC = () => {
  const [authUserId, setAuthUserId] = useState<string | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [state, setState] = useState<'idle' | 'joining' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  /**
   * Hidden while she signs in, without forgetting the invite.
   *
   * This is a full-screen overlay, so it would cover the sign-in form it just
   * sent her to. Dismissing it instead would drop the token. It stays mounted
   * and keeps watching the session, so the claim still fires the moment the
   * account exists — she never comes back to this screen.
   */
  const [steppedAside, setSteppedAside] = useState(false);

  // Its own session watch. Whether the friend signs in on this screen or
  // arrives already signed in, the claim has to fire either way.
  useEffect(() => {
    let cancelled = false;
    void getSession().then(session => {
      if (!cancelled) setAuthUserId(session?.user?.id);
    });
    // Two shapes: Supabase's { data: { subscription } }, or the no-op stub
    // returned when there is no client configured at all.
    const handle = subscribeToAuthChanges((_event, session) => {
      setAuthUserId(session?.user?.id);
    });
    return () => {
      cancelled = true;
      if ('unsubscribe' in handle) handle.unsubscribe();
      else handle.data?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const found = readPendingInvite(window.location.search, window.sessionStorage);
    if (!found) return;
    setToken(found);
    stripInviteFromUrl();

    void previewInvite(found).then(result => {
      if (result.status === 'ok' && result.data) setPreview(result.data);
      if (result.status === 'ok' && !result.data) {
        setState('error');
        setError('這個邀請連結已經失效了，請對方重新產生一次。');
      }
    });
  }, []);

  // Claimed as soon as there is an account to claim it with, whether that
  // account already existed or was created a moment ago.
  useEffect(() => {
    if (!token || !authUserId || state !== 'idle' || (preview?.alreadyClaimed ?? false)) return;
    setState('joining');
    void claimInvite(token).then(result => {
      if (result.status === 'ok') {
        clearPendingInvite(window.sessionStorage);
        // The one thing the claim knows and the app did not: which trip.
        try {
          if (typeof result.data === 'string' && result.data.trim()) {
            window.localStorage.setItem(JOINED_KEY, result.data.trim());
          }
        } catch { /* private mode: the reload still lands in the bookshelf */ }
        setState('done');
        // A reload rather than threading a refresh back into App. The trip
        // only becomes visible once row-level security sees a membership
        // row, and every list in the app reads it on start — one reload is
        // both simpler and more certain than a dozen refresh paths, for
        // something that happens once per trip.
        window.location.reload();
        return;
      }
      setState('error');
      setError(result.status === 'unavailable' ? '雲端尚未設定，無法加入。' : claimFailureMessage(result.message));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authUserId, state]);

  if (!token) return null;
  if (state === 'done') return null;
  // Deliberately after the effects above, so stepping aside never unsubscribes
  // the session watch that is going to complete the join.
  if (steppedAside) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[#11183d]/40 p-4 md:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2 text-[#5b3df5]">
          <Users size={18} />
          <span className="text-[10px] font-extrabold uppercase tracking-[.16em]">TRIP INVITE</span>
        </div>

        {state === 'error' ? (
          <>
            <h2 className="mt-2 text-lg font-black text-[#11183d]">這個邀請沒辦法使用</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          </>
        ) : (
          <>
            <h2 className="mt-2 text-lg font-black text-[#11183d]">
              {preview ? `一起去「${preview.tripName}」` : '正在確認邀請…'}
            </h2>
            {preview && (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                你會以「{preview.memberName}」的身分加入，行程與帳目都看得到，也可以一起編輯。
              </p>
            )}
            {!authUserId && (
              /* Said plainly, because the next step is somebody else's screen.
                 The link is remembered, so coming back after registering
                 lands them in the trip rather than in an empty app. */
              <>
                <p className="mt-3 rounded-2xl bg-[#f3f0ff] px-3.5 py-3 text-xs leading-5 text-[#4d35c7]">
                  先登入或註冊，完成後會自動加入這趟旅程——這個邀請會保留著。
                </p>
                {/* The sentence above described a next step that had no button
                    under it: the only thing to press was 稍後再說. */}
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
                    setSteppedAside(true);
                  }}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2F5BFF] to-[#8B3DFF] text-sm font-black text-white"
                >
                  <LogIn size={16} />登入 / 註冊並加入
                </button>
              </>
            )}
            {state === 'joining' && (
              <p className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                <Loader2 size={14} className="animate-spin" />正在加入…
              </p>
            )}
            {preview?.alreadyClaimed && (
              <p className="mt-3 text-xs font-bold text-slate-500">
                <Check size={13} className="mr-1 inline" />這個邀請已經被使用過了。
              </p>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => {
            clearPendingInvite(window.sessionStorage);
            setToken(null);
          }}
          className="mt-4 min-h-11 w-full rounded-2xl bg-slate-100 text-sm font-black text-slate-600"
        >
          {state === 'error' ? '關閉' : '稍後再說'}
        </button>
      </div>
    </div>
  );
};

export default JoinTripSheet;
