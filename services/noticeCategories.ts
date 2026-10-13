import { DisputeNotice } from './disputeInbox';

/**
 * The shelves the notification list is divided into.
 *
 * 「這個是「旅行」的通知 不是社群的通知」. Everything behind the bell is about a
 * trip — a question on a shared bill, a flight that moved, an itinerary someone
 * changed. Naming the shelves is what makes that legible: a single undivided
 * list of bill questions reads as a feature that only does one thing, when in
 * fact it is the one shelf that currently has anything on it.
 *
 * The empty shelves are kept rather than hidden. A filter that appears only
 * once it has contents cannot be used to find out that there is nothing there,
 * which is the question someone taps a filter to answer.
 */
export type NoticeCategory = 'all' | 'itinerary' | 'settlement' | 'travel' | 'system';

export const NOTICE_CATEGORIES: [NoticeCategory, string][] = [
  ['all', '全部'],
  ['itinerary', '行程提醒'],
  ['settlement', '分帳與收款'],
  ['travel', '航班與住宿'],
  ['system', '系統通知'],
];

/**
 * Which shelf a notice belongs on.
 *
 * A dispute is a question about money between two travellers, so it is
 * settlement — not an itinerary change, even though it is raised inside a trip.
 */
export const noticeCategory = (notice: DisputeNotice): NoticeCategory =>
  /*
    A friend request is the one notice that is not about a trip at all — it
    is between two accounts, and it would be found under 分帳與收款 by nobody.
    「系統通知」 is the shelf for things the app tells you about itself.
  */
  (notice.kind === 'friend_request' ? 'system' : 'settlement');

export const noticesInCategory = (
  notices: DisputeNotice[],
  category: NoticeCategory,
): DisputeNotice[] =>
  (category === 'all' ? notices : notices.filter(notice => noticeCategory(notice) === category));
