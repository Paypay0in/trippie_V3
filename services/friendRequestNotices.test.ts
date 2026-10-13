import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { describeNotice, unseenNotices } from './disputeInbox';
import { noticeCategory } from './noticeCategories';
import { friendRequestNotices } from './friendRequestNotices';

/**
 * 「當我發送好友邀請通知 Gina 要收到通知」.
 *
 * The sender's screen says 「已邀請」 and 「對方接受後才會成為好友」. The other
 * person was told nothing at all, so the invitation sat waiting for somebody
 * who had no way to know it existed.
 *
 * The rows were already on her device — `fetchFriendships` returns both
 * directions and the friends panel has always separated incoming from
 * outgoing. Only the bell never saw them.
 */

const ANN = 'auth-ann';
const GINA = 'auth-gina';

const people = {
  [ANN]: { id: ANN, displayName: 'Ann' },
  [GINA]: { id: GINA, displayName: 'Gina' },
};

const pending = { requesterId: ANN, addresseeId: GINA, status: 'pending' as const };

describe('an invitation waiting on the person who received it', () => {
  it('reaches the person it was sent to', () => {
    const [notice] = friendRequestNotices({
      friendships: [pending],
      people,
      myUserId: GINA,
    });

    expect(notice?.kind).toBe('friend_request');
    expect(describeNotice(notice)).toBe('Ann 想加你為好友');
  });

  /** The sender already knows; the screen they sent it from says 「已邀請」. */
  it('says nothing to the person who sent it', () => {
    expect(friendRequestNotices({ friendships: [pending], people, myUserId: ANN }))
      .toEqual([]);
  });

  it('says nothing once it has been accepted', () => {
    expect(friendRequestNotices({
      friendships: [{ ...pending, status: 'accepted' }],
      people,
      myUserId: GINA,
    })).toEqual([]);
  });

  /**
   * Keyed on the pair. A friendship row has no id of its own, and the two
   * people are what makes it unique — so a request withdrawn and sent again
   * is the same notice, and dismissing it stays dismissed.
   */
  it('is one notice per pair, however often it is sent', () => {
    const [first] = friendRequestNotices({ friendships: [pending], people, myUserId: GINA });
    const [again] = friendRequestNotices({ friendships: [pending], people, myUserId: GINA });

    expect(first.id).toBe(again.id);
    expect(unseenNotices([again], [first.id])).toEqual([]);
  });

  /** A name that has not loaded yet must not stop the notice appearing. */
  it('still reports a request from somebody it cannot name', () => {
    const [notice] = friendRequestNotices({
      friendships: [pending],
      people: {},
      myUserId: GINA,
    });

    expect(notice?.kind).toBe('friend_request');
    expect(describeNotice(notice)).toBe('旅伴 想加你為好友');
  });

  /**
   * The one notice that is not about a trip. Under 分帳與收款 it would be found
   * by nobody; 系統通知 is the shelf for what the app tells you about itself.
   */
  it('goes on the system shelf, not the settlement one', () => {
    const [notice] = friendRequestNotices({ friendships: [pending], people, myUserId: GINA });
    expect(noticeCategory(notice)).toBe('system');
  });
});

describe('and what tapping it does', () => {
  const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

  /**
   * Opening nothing is how a notice becomes a thing people stop tapping. A
   * friend request has no expense, so it goes where it can be answered.
   */
  it('opens the friends panel rather than an expense', () => {
    expect(APP).toContain("if (notice.kind === 'friend_request') {");
    expect(APP).toContain('if (notice.expenseId) setDisputeExpenseId(notice.expenseId);');
  });

  /**
   * And that the bell is actually given them.
   *
   * Written after taking the wiring out and watching every other test here
   * still pass: a producer nobody calls is a feature that exists only in its
   * own tests.
   */
  it('is merged into the notices the bell is handed', () => {
    const list = APP.slice(APP.indexOf('const disputeNotices = useMemo('));
    const body = list.slice(0, list.indexOf('seenDisputeNotices,\n    ),'));

    expect(body).toContain('...friendRequestNotices({');
    expect(body).toContain('myUserId: authUser?.id,');
  });

  /** And is not sent to 旅行 first, which would move the reader twice. */
  it('skips the detour into the trip section', () => {
    expect(APP).toContain('if (notice.kind !== "friend_request") setAppSection("trips");');
  });
});
