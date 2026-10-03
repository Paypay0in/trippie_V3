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
/**
 * A refund already received, in the ledger's own currency.
 *
 * 「若是在結帳時已退稅，要回頭去去掉該筆帳的總額」. Money handed back at the till is
 * money that never left — counting the sticker price as spend overstates the
 * trip by the whole refund.
 *
 * Only a figure the traveller actually recorded counts. An estimate is what the
 * app thinks the counter might pay; subtracting one from a real total would be
 * the app paying itself back in arithmetic.
 */
export const refundReceivedInTwd = (expense: Expense): number => {
  const actual = expense.taxRefundActual;
  if (!Number.isFinite(actual as number) || (actual as number) <= 0) return 0;
  const rate = Number.isFinite(expense.exchangeRate) && expense.exchangeRate > 0 ? expense.exchangeRate : 1;
  // The refund is in the purchase's own currency, like the amount it came off.
  return (actual as number) * rate;
};

/**
 * What a bill actually cost, after anything already refunded on it.
 *
 * Floored at zero: a refund larger than the purchase is a mis-keyed figure, and
 * a negative expense would read as income on every screen that sums these.
 */
export const expenseNetAmount = (expense: Expense): number => {
  if (!Number.isFinite(expense.twdAmount)) return 0;
  return Math.max(0, expense.twdAmount - refundReceivedInTwd(expense));
};

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
  /*
    Net of anything already refunded, before the split.

    Two people halving a 18,000 purchase that gave 1,080 back at the counter
    each carry half of 16,920, not half of 18,000 — the refund came off the one
    bill they are sharing.
  */
  const whole = expenseNetAmount(expense);
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
  if (!Number.isFinite(share)) return 0;
  // The split calculator works from the gross bill, so the reader's share is
  // scaled by the same proportion the refund took off it.
  const gross = expense.twdAmount;
  return gross > 0 ? (share as number) * (whole / gross) : 0;
};

/** The owner's member id, which the split calculator needs to resolve aliases. */
export const ownerMemberIdOf = (members: TripMember[] = []): string | undefined =>
  members.find(member => member.type === 'owner')?.id;
