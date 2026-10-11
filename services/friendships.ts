import { supabase, supabaseConfigured } from './supabaseClient';
import { FriendshipRow, friendIdsFor } from './postVisibility';

/**
 * Friends, as rows.
 *
 * 「這裡要有可以加朋友的欄位」 — asked for before the tables exist, which is the
 * situation this file is written around.
 *
 * Everything here can report `setup_required`, and that is the point. A screen
 * that cannot reach its table has two ways to behave: say 「查無此人」, which is
 * a lie that sends somebody off to check their friend's spelling, or say what
 * is actually true. The second costs one branch and is the difference between
 * a control that is not finished and a control that is broken.
 */

export interface Person {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Friendship {
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted';
}

export type FriendResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' }
  /** The migration has not been run: the table or function is not there yet. */
  | { status: 'setup_required' }
  | { status: 'error'; message: string };

/**
 * Postgres codes for 「that relation does not exist」 and 「that function does
 * not exist」. PostgREST passes them through, so a missing migration is
 * distinguishable from a real failure rather than being reported as one.
 */
const MISSING_OBJECT_CODES = new Set(['42P01', '42883', 'PGRST202']);

const classify = (error: { code?: string; message?: string } | null): FriendResult<never> => {
  if (error?.code && MISSING_OBJECT_CODES.has(error.code)) return { status: 'setup_required' };
  const message = error?.message || '';
  if (/does not exist|schema cache/i.test(message)) return { status: 'setup_required' };
  return { status: 'error', message: message || '未知的錯誤' };
};

const ready = (): boolean => supabaseConfigured && supabase !== null;

/**
 * One person, by the exact address already known.
 *
 * The matching, the single row and the refusal to return the address are all
 * decided in the database function — see 0027. This only carries the answer.
 */
export const findPersonByEmail = async (email: string): Promise<FriendResult<Person | null>> => {
  if (!ready()) return { status: 'unavailable' };
  const { data, error } = await supabase!.rpc('find_person_by_email', { lookup_email: email });
  if (error) return classify(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { status: 'ok', data: null };
  return {
    status: 'ok',
    data: { id: row.id, displayName: row.display_name || '旅人', avatarUrl: row.avatar_url || undefined },
  };
};

/** Every friendship this account is on either side of. */
export const fetchFriendships = async (): Promise<FriendResult<Friendship[]>> => {
  if (!ready()) return { status: 'unavailable' };
  const { data, error } = await supabase!
    .from('friendships')
    .select('requester_id, addressee_id, status');
  if (error) return classify(error);
  return {
    status: 'ok',
    data: (data || []).map(row => ({
      requesterId: row.requester_id,
      addresseeId: row.addressee_id,
      status: row.status,
    })),
  };
};

export const requestFriend = async (addresseeId: string): Promise<FriendResult<null>> => {
  if (!ready()) return { status: 'unavailable' };
  const { data: session } = await supabase!.auth.getUser();
  const me = session?.user?.id;
  if (!me) return { status: 'unavailable' };
  const { error } = await supabase!
    .from('friendships')
    .insert({ requester_id: me, addressee_id: addresseeId });
  if (error) return classify(error);
  return { status: 'ok', data: null };
};

/**
 * Accept, which only the person who was asked may do.
 *
 * Addressed by the pair rather than by a row id, because that is the key: it
 * makes 「accept the request from this person」 impossible to aim at anybody
 * else's row by mistake.
 */
export const acceptFriend = async (requesterId: string): Promise<FriendResult<null>> => {
  if (!ready()) return { status: 'unavailable' };
  const { data: session } = await supabase!.auth.getUser();
  const me = session?.user?.id;
  if (!me) return { status: 'unavailable' };
  const { error } = await supabase!
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', me);
  if (error) return classify(error);
  return { status: 'ok', data: null };
};

/** Either side may end it; withdrawing a request you sent is the same call. */
export const removeFriend = async (otherId: string): Promise<FriendResult<null>> => {
  if (!ready()) return { status: 'unavailable' };
  const { data: session } = await supabase!.auth.getUser();
  const me = session?.user?.id;
  if (!me) return { status: 'unavailable' };
  const { error } = await supabase!
    .from('friendships')
    .delete()
    .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me})`);
  if (error) return classify(error);
  return { status: 'ok', data: null };
};

export { friendIdsFor };
export type { FriendshipRow };

/**
 * The people behind a set of ids.
 *
 * A friend list of uuids is not a friend list. `profiles` is readable to any
 * signed-in account by its existing policy, so this needs nothing new — but it
 * takes the ids it was given and nothing else, so it cannot become a way to
 * page through the table.
 */
export const fetchPeople = async (ids: string[]): Promise<FriendResult<Person[]>> => {
  if (!ready()) return { status: 'unavailable' };
  if (ids.length === 0) return { status: 'ok', data: [] };
  const { data, error } = await supabase!
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids);
  if (error) return classify(error);
  return {
    status: 'ok',
    data: (data || []).map(row => ({
      id: row.id,
      displayName: row.display_name || '旅人',
      avatarUrl: row.avatar_url || undefined,
    })),
  };
};
