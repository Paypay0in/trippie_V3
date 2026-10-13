import { DisputeNotice } from './disputeInbox';
import { Friendship, Person } from './friendships';

/**
 * Invitations waiting on the person who received them.
 *
 * 「當我發送好友邀請通知 Gina 要收到通知」. The sender's screen says 「已邀請」 and
 * 「對方接受後才會成為好友」, and the other person was told nothing at all — so
 * the invitation sat waiting for somebody who had no way to know it existed.
 *
 * The data was already on her device: `fetchFriendships` returns both
 * directions, and the friends panel has always separated incoming from
 * outgoing to draw its own list. Only the bell never saw it, which is why a
 * request could be sent and received and still reach nobody.
 *
 * Outgoing requests make no notice. The sender already knows; the screen they
 * sent it from says so.
 */

export interface FriendRequestNoticeInput {
  friendships: Friendship[];
  /** Resolved people, keyed by user id, as the friends panel already holds. */
  people: Record<string, Person | undefined>;
  myUserId?: string;
}

export const friendRequestNotices = ({
  friendships,
  people,
  myUserId,
}: FriendRequestNoticeInput): DisputeNotice[] => {
  if (!myUserId) return [];

  return friendships
    .filter(row => row.status === 'pending' && row.addresseeId === myUserId)
    .map(row => {
      const person = people[row.requesterId];
      return {
        /*
          Keyed on the pair, not on a row id.

          A friendship has no id of its own here, and the two people are what
          makes it unique — so a request withdrawn and sent again is the same
          notice, and dismissing it stays dismissed.
        */
        id: `friend:${row.requesterId}:${myUserId}`,
        kind: 'friend_request' as const,
        message: '想加你為好友',
        fromMemberId: row.requesterId,
        fromName: person?.displayName?.trim() || undefined,
        /*
          No timestamp exists on a friendship row, and inventing `now` would
          reshuffle the list on every render. Empty sorts to the bottom, which
          is honest: the bell cannot say when this arrived.
        */
        at: '',
      };
    });
};
