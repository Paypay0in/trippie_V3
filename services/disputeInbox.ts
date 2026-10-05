import { Expense, ExpenseDispute, TripMember } from '../types';
import { getDisputes } from './expenseDisputes';
import { getExpenseCreatorMemberId } from './expensePermissions';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * Who needs to know a question was asked.
 *
 * 「我提出疑問後，希望對方要收到疑問的通知📢」.
 *
 * A dispute was written onto the expense and then sat there. The only sign of
 * it was a small badge on one row of one list — on the phone of whoever opened
 * that list, scrolled to that day, and happened to look. The person actually
 * being asked could go the whole trip without seeing it, which makes the
 * feature a note to oneself rather than a question.
 *
 * Both directions matter, and they are not the same thing. One is work waiting
 * on you; the other is an answer you asked for. Collapsing them into 「2 則通知」
 * would hide which of the two you are looking at.
 */

export type DisputeNoticeKind = 'awaiting_my_answer' | 'my_question_answered';

export interface DisputeNotice {
  /** `${expenseId}:${disputeId}:${kind}` — stable, so 「seen」 can be stored. */
  id: string;
  kind: DisputeNoticeKind;
  expenseId: string;
  expenseDescription: string;
  disputeId: string;
  /** The question, or the answer, depending on which way this is pointing. */
  message: string;
  /** Who it is from: the asker, or whoever answered. */
  fromMemberId?: string;
  fromName?: string;
  /** When the thing being reported happened, newest first in the list. */
  at: string;
}

const nameOf = (members: TripMember[], memberId?: string): string | undefined =>
  members.find(member => member.id === memberId)?.name?.trim() || undefined;

/**
 * Everything the viewer has not dealt with, newest first.
 *
 * A question is 「awaiting my answer」 only on an expense I created: the record
 * is mine to correct, and telling three other members about a question none of
 * them can answer is noise addressed to the wrong people.
 */
export const disputeNoticesFor = ({
  expenses,
  viewerMemberId,
  tripOwnerMemberId,
  members = [],
}: {
  expenses: Expense[];
  viewerMemberId: string;
  tripOwnerMemberId: string;
  members?: TripMember[];
}): DisputeNotice[] => {
  if (!viewerMemberId) return [];
  const me = normalizeOwnerMemberId(viewerMemberId, tripOwnerMemberId);
  const notices: DisputeNotice[] = [];

  for (const expense of expenses) {
    const creator = getExpenseCreatorMemberId(expense, tripOwnerMemberId);
    const mine = normalizeOwnerMemberId(creator || '', tripOwnerMemberId) === me;

    for (const dispute of getDisputes(expense)) {
      const raiser = normalizeOwnerMemberId(dispute.raisedByMemberId || '', tripOwnerMemberId);
      const base = {
        expenseId: expense.id,
        expenseDescription: expense.description || '這筆支出',
        disputeId: dispute.id,
      };

      /*
        Somebody is waiting on me.

        Never for a question I raised on my own record — that is a note to
        myself, and reporting it back as an unanswered question would be the
        app asking me something I just said.
      */
      if (mine && dispute.status === 'open' && raiser !== me) {
        notices.push({
          ...base,
          id: `${expense.id}:${dispute.id}:awaiting_my_answer`,
          kind: 'awaiting_my_answer',
          message: dispute.message,
          fromMemberId: dispute.raisedByMemberId,
          fromName: nameOf(members, dispute.raisedByMemberId),
          at: dispute.createdAt,
        });
        continue;
      }

      /*
        An answer to something I asked.

        Worth saying because the asker has no reason to reopen a row they
        already questioned — a reply nobody is told about is a reply nobody
        reads. Covers a correction applied without a sentence, too.
      */
      if (raiser === me && dispute.status === 'resolved') {
        notices.push({
          ...base,
          id: `${expense.id}:${dispute.id}:my_question_answered`,
          kind: 'my_question_answered',
          message: dispute.response?.trim() || (dispute.appliedAt ? '已照你的提議修正了' : '這筆疑問已結案'),
          fromMemberId: dispute.respondedByMemberId,
          fromName: nameOf(members, dispute.respondedByMemberId),
          at: dispute.resolvedAt || dispute.createdAt,
        });
      }
    }
  }

  return notices.sort((left, right) => (right.at || '').localeCompare(left.at || ''));
};

/** The ones still worth showing, given what has already been seen. */
export const unseenNotices = (notices: DisputeNotice[], seen: string[]): DisputeNotice[] => {
  const dismissed = new Set(seen);
  return notices.filter(notice => !dismissed.has(notice.id));
};

export const DISPUTE_NOTICES_SEEN_STORAGE_KEY = 'trippie_dispute_notices_seen_v1';

export const loadSeenNotices = (): string[] => {
  try {
    const raw = localStorage.getItem(DISPUTE_NOTICES_SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

export const saveSeenNotices = (ids: string[]): void => {
  try {
    // Capped, and newest kept: this is a dismissal record, not a history.
    localStorage.setItem(DISPUTE_NOTICES_SEEN_STORAGE_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // A blocked store costs a banner reappearing, which is the safe failure.
  }
};

/** What a dispute looks like to the person who must answer it. */
export const describeNotice = (notice: DisputeNotice): string =>
  (notice.kind === 'awaiting_my_answer'
    ? `${notice.fromName || '旅伴'} 對「${notice.expenseDescription}」提出疑問`
    : `${notice.fromName || '旅伴'} 回覆了你對「${notice.expenseDescription}」的疑問`);

/** Only the ones the viewer has to act on. */
export const awaitingMyAnswer = (notices: DisputeNotice[]): DisputeNotice[] =>
  notices.filter(notice => notice.kind === 'awaiting_my_answer');

export type { ExpenseDispute };
