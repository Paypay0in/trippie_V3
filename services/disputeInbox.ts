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

export type DisputeNoticeKind =
  | 'awaiting_my_answer'
  | 'my_question_answered'
  /**
   * 「若有分帳指給我 要跳通知」.
   *
   * Somebody else recorded a bill and put the viewer in its split. Until now
   * the only way to find out was to open the ledger and read it — so a
   * traveller learned what they owed by going looking, which is the thing a
   * shared ledger exists to stop. The bell's own hint already promised this
   * (「當有人新增支出…我們會立即通知你」) and only disputes were ever produced.
   */
  | 'split_to_me'
  /**
   * 「當我發送好友邀請通知 Gina 要收到通知」.
   *
   * The sender's screen says 「已邀請」 and 「對方接受後才會成為好友」 — but the
   * other person was told nothing, so the invitation sat waiting for someone
   * who had no way to know it existed. The data was already on her device;
   * only the bell never saw it.
   */
  | 'friend_request';

export interface DisputeNotice {
  /** `${expenseId}:${disputeId}:${kind}` — stable, so 「seen」 can be stored. */
  id: string;
  kind: DisputeNoticeKind;
  /** Absent on a notice that is not about a bill at all. */
  expenseId?: string;
  expenseDescription?: string;
  /** Absent on a notice that is about the bill itself, not a question on it. */
  disputeId?: string;
  /** The question, or the answer, depending on which way this is pointing. */
  message: string;
  /** Who it is from: the asker, or whoever answered. */
  fromMemberId?: string;
  fromName?: string;
  /** When the thing being reported happened, newest first in the list. */
  at: string;
}

/**
 * Whether this bill puts the member on the hook, by either of the two ways a
 * split is recorded.
 *
 * Deliberately not `expenseConcernsMember`: that answers 「is this any of your
 * business」 and says yes to a bill you merely paid for somebody else. Being
 * told 「someone split a cost to you」 about your own purchase would be noise.
 */
const isSplitTo = (expense: Expense, me: string, ownerId: string): boolean => {
  const named = (expense.beneficiaries || [])
    .some(id => normalizeOwnerMemberId(id || '', ownerId) === me);
  if (named) return true;

  const allocations = expense.splitAllocations || {};
  return Object.entries(allocations).some(([id, amount]) =>
    normalizeOwnerMemberId(id, ownerId) === me
    && typeof amount === 'number' && amount !== 0);
};

/** 「你分到 2,500 KRW」, or the bill's own total when the share is not stated. */
const shareLine = (expense: Expense, me: string): string => {
  const exact = expense.splitAllocations?.[me];
  const currency = expense.currency || '';
  if (typeof exact === 'number' && exact !== 0) {
    return `你分到 ${Math.round(exact).toLocaleString()} ${currency}`.trim();
  }
  const people = expense.beneficiaries?.length || 0;
  if (people > 1 && typeof expense.amount === 'number') {
    return `${people} 人均分 ${Math.round(expense.amount).toLocaleString()} ${currency}`.trim();
  }
  return typeof expense.amount === 'number'
    ? `${Math.round(expense.amount).toLocaleString()} ${currency}`.trim()
    : '這筆有分到你';
};

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

    /*
      A bill somebody else split to me.

      「若有分帳指給我 要跳通知」. Until now the only way to learn that you owed
      something was to open the ledger and read it — a traveller finding out
      what they owe by going looking is the thing a shared ledger exists to
      stop. The bell's own hint already promised this.

      Never for a bill I recorded, even when I am in its split: I put myself
      there, and telling me about it is the app repeating what I just typed.

      Keyed on the expense rather than a dispute, so editing the split later
      does not produce a second notice for the same bill — and so dismissing
      it stays dismissed.
    */
    if (!mine && isSplitTo(expense, me, tripOwnerMemberId)) {
      notices.push({
        expenseId: expense.id,
        expenseDescription: expense.description || '這筆支出',
        id: `${expense.id}:split_to_me`,
        kind: 'split_to_me',
        message: shareLine(expense, me),
        fromMemberId: creator,
        fromName: nameOf(members, creator),
        // The bill's own date: an Expense carries no creation timestamp, and
        // inventing `now` would reshuffle the list on every render.
        at: expense.date || '',
      });
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
export const describeNotice = (notice: DisputeNotice): string => {
  const who = notice.fromName || '旅伴';
  if (notice.kind === 'awaiting_my_answer') {
    return `${who} 對「${notice.expenseDescription}」提出疑問`;
  }
  if (notice.kind === 'split_to_me') {
    return `${who} 新增「${notice.expenseDescription}」並分帳給你`;
  }
  if (notice.kind === 'friend_request') {
    return `${who} 想加你為好友`;
  }
  return `${who} 回覆了你對「${notice.expenseDescription}」的疑問`;
};

/** Only the ones the viewer has to act on. */
export const awaitingMyAnswer = (notices: DisputeNotice[]): DisputeNotice[] =>
  notices.filter(notice => notice.kind === 'awaiting_my_answer');

export type { ExpenseDispute };
