import { FriendResult } from './friendships';

/**
 * What to tell somebody when a friend action did not go through.
 *
 * 「沒動」. Every one of these calls used to be awaited and thrown away, so a
 * refused write and a successful one looked the same from the outside: the
 * list reloaded, showed exactly what it showed before, and said nothing at
 * all. A screen that cannot distinguish 「it worked」 from 「it did not」 teaches
 * the traveller to press the button again.
 *
 * Each case says what it actually is. 「未知的錯誤」 on a missing table would
 * send somebody to check their friend's email for a problem that is in the
 * database, which is the same mistake `classify` exists to avoid.
 */
export const friendProblem = (result: FriendResult<unknown>): string => {
  if (result.status === 'ok') return '';
  if (result.status === 'unavailable') return '還沒有登入，或是雲端沒有設定。';
  if (result.status === 'setup_required') return '好友功能的資料表還沒建立。';
  return result.message || '沒有成功，請再試一次。';
};
