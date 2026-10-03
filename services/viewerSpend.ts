import { Expense, TripMember } from '../types';
import { calculateExpenseLedger } from './splitCalculator';

/**
 * What a bill actually cost the person reading the screen.
 *
 * 「對方的帳又算到我這裡了」, and before that 「分帳完 我只出一半 所以 12000 我只花
 * 6000」 and 「總結算頁面又讓 Gina 的帳也加在我的上面」. The same complaint has now
 * been made about four different screens, because four screens were each doing
 * this arithmetic themselves and the fifth was not doing it at all.
 *
 * Two things a total must not count, and both were being counted:
 *  - a bill the other traveller paid for themselves, which is none of the
 *    reader's money
 *  - the whole of a split bill, when the reader carries half of it
 *
 * Without a viewer identity the full amount is the only honest answer: a
 * single-user ledger has nobody to apportion to, and quietly reporting a
 * fraction there would understate what somebody spent.
 */
export const expenseCostToViewer = (
  expense: Expense,
  viewerMemberId?: string,
  tripOwnerMemberId?: string,
): number => {
  /*
    The amount is checked before the calculator ever sees it.

    A bill with a non-finite `twdAmount` drives the split calculator into a loop
    that pins a core until the tab is killed — it has done it once already, in
    the ledger list. Returning zero here is both the safe answer and the correct
    one: an amount that is not a number is not money anybody spent.
  */
  if (!Number.isFinite(expense.twdAmount)) return 0;
  const whole = expense.twdAmount;
  if (!viewerMemberId) return whole;

  const { responsibility } = calculateExpenseLedger(expense, tripOwnerMemberId);

  /*
    A bill nobody carries is the payer's own.

    An expense recorded with no sharers at all produces an empty responsibility
    map. Reading that as "costs the viewer nothing" would drop the reader's own
    solo coffee out of their own total, so the payer wears it.
  */
  if (Object.keys(responsibility).length === 0) {
    return expense.payerId === viewerMemberId ? whole : 0;
  }

  const share = responsibility[viewerMemberId];
  return Number.isFinite(share) ? share : 0;
};

/** The owner's member id, which the split calculator needs to resolve aliases. */
export const ownerMemberIdOf = (members: TripMember[] = []): string | undefined =>
  members.find(member => member.type === 'owner')?.id;
