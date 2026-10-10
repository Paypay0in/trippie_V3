import { Expense } from '../types';

/** What a refund entry is called in the ledger. */
export const REFUND_DESCRIPTION = '退稅入帳 (Tax Refund)';

/**
 * The refund already recorded for this trip, if there is one.
 *
 * 「我按下去確認入帳 沒有反應」. The check used to ask whether a refund sat in the
 * 返程 stage. The stage is derived from the date now, so a refund handed back
 * at the till mid-trip is filed 旅行中 and a stage-based check stops seeing it —
 * silently allowing a second one, or, before that, silently blocking a first.
 *
 * A refund is recognised by being one, from whichever stage it was filed into.
 */
export const findDuplicateRefund = (expenses: Expense[]): Expense | undefined =>
  expenses.find(expense => expense.description === REFUND_DESCRIPTION);

/**
 * Whether this record is a refund rather than something bought.
 *
 * 「我覺得退稅入帳可以直接放進去這個綠色框框」「只要在結算的時候放入這 recap 就好」.
 * A refund was written as a negative expense, so it sat in 返程支出／機場消費
 * among the things the traveller paid for — reading as a purchase of −70, and
 * displayed as +TWD 0 because the share calculation floors at zero.
 *
 * Money coming back is not spending. It belongs to the recap, where the trip is
 * totted up, and nowhere in a list headed 支出.
 */
export const isRefundEntry = (expense: Expense): boolean =>
  expense.description === REFUND_DESCRIPTION;

/** The refund credited to this trip, in TWD, as a positive amount. */
export const creditedRefundTwd = (expenses: Expense[]): number => {
  const refund = findDuplicateRefund(expenses);
  if (!refund || !Number.isFinite(refund.twdAmount)) return 0;
  return Math.abs(refund.twdAmount);
};
