import { Category, Expense, TaxRule } from '../types';

/**
 * Whether a recorded purchase is still worth carrying to the refund counter.
 *
 * 「怎麼都沒跳出可退稅的提示」. A 30,800 KRW purchase and an 18,900 KRW one sat in
 * the ledger looking exactly like the 8,000 KRW card that does not qualify.
 * The estimate knew; the row did not say.
 *
 * Deliberately the same conditions the estimate uses, so a row that says 可退稅
 * is a row that is in the total above it. Two rules for one question is how two
 * screens come to disagree about money.
 */
export const qualifiesForRefund = (expense: Expense, taxRule?: TaxRule | null): boolean => {
  if (!taxRule || !(taxRule.refundRate > 0) || !Number.isFinite(taxRule.minSpend)) return false;
  if (expense.phase !== 'during' || expense.category !== Category.SHOPPING) return false;
  // Only a bill in the rule's own currency can be judged against its threshold.
  if ((expense.currency || '').toUpperCase() !== (taxRule.currency || '').toUpperCase()) return false;
  if (!Number.isFinite(expense.amount) || expense.amount < taxRule.minSpend) return false;
  /*
    Nothing to say about a purchase already settled or ruled out.

    Marked 不可退稅, refunded at the till, or with a figure already recorded —
    each of those is an answer, and a row that keeps suggesting a queue after
    the traveller has answered is noise.
  */
  if (expense.taxRefundIneligible === true || expense.taxRefundedAtPurchase === true) return false;
  return !Number.isFinite(expense.taxRefundActual as number);
};
