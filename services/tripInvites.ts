import { supabase } from './supabaseClient';
import { SyncResult } from './tripSync';

/**
 * Inviting one person onto one trip.
 *
 * Every call goes through a database function rather than touching the
 * tables. That is not indirection for its own sake: the person joining is
 * refused by both member policies — one wants them to already be a member,
 * the other wants them to be the owner — and widening either would open
 * every trip to everyone. The functions are the narrow hole.
 *
 * The link carries a token and nothing else. Knowing it is the authorisation,
 * so it belongs in a private message, not a public post.
 */

/** The shape a link takes. Read by the app on open, then cleared from the URL. */
export const INVITE_QUERY_PARAM = 'join';

export const inviteLinkFor = (token: string, origin: string): string =>
  `${origin.replace(/\/$/, '')}/?${INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`;

/** The token in the current address, if this page was opened from an invite. */
export const inviteTokenFromUrl = (search: string): string | null => {
  const token = new URLSearchParams(search).get(INVITE_QUERY_PARAM);
  return token && token.trim() ? token.trim() : null;
};

export interface InvitePreview {
  tripName: string;
  memberName: string;
  alreadyClaimed: boolean;
}

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

/**
 * A link for one companion's seat.
 *
 * Re-inviting the same companion replaces the previous link rather than
 * adding a second — two live ways into one seat is two people who both think
 * they are Gina.
 */
export const createInviteLink = async (
  tripId: string,
  memberId: string,
): Promise<SyncResult<string>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('create_trip_invite', {
      target_trip_id: tripId,
      target_member_id: memberId,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('沒有拿到邀請連結。');
    return { status: 'ok', data };
  } catch (error) {
    return failed(error);
  }
};

/**
 * What this link is for, readable before signing in.
 *
 * So the screen can say who invited whom instead of demanding an account for
 * an unexplained URL. Returns the two names and nothing else.
 */
export const previewInvite = async (token: string): Promise<SyncResult<InvitePreview | null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('peek_trip_invite', { invite_token: token });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { status: 'ok', data: null };
    return {
      status: 'ok',
      data: {
        tripName: row.trip_name ?? '',
        memberName: row.member_name ?? '',
        alreadyClaimed: row.already_claimed === true,
      },
    };
  } catch (error) {
    return failed(error);
  }
};

/**
 * Takes the seat. Returns the trip that was joined.
 *
 * Claiming an existing companion rather than adding a person is the whole
 * point: the roster the owner already built stays as it is, and the name
 * they typed simply gains an account behind it. Opening the same link twice
 * is not an error — the second call finds the user already aboard and hands
 * the trip back unchanged.
 */
export const claimInvite = async (token: string): Promise<SyncResult<string>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('claim_trip_invite', { invite_token: token });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('加入失敗，請再試一次。');
    return { status: 'ok', data };
  } catch (error) {
    return failed(error);
  }
};
