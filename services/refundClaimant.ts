import { Expense } from '../types';
import { expenseCostToViewer, expenseNetAmount } from './viewerSpend';

/**
 * How much of a purchase's tax refund is this reader's.
 *
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」, then
 * 「若某帳一起結帳 但同時可以退稅 請將退稅的總額按比例分配」.
 *
 * The refund list was built from every bill that concerns the reader, whole.
 * So Gina's 75,900 KRW of 藥品 — half of which is North's — sat on his recap
 * offering him the entire 4,554 KRW back, while sitting on hers offering the
 * same 4,554 again. One receipt, counted twice.
 *
 * Hiding it from him instead would have been just as wrong in the other
 * direction: he is paying for half of that medicine, so half of what the
 * counter gives back is his, whoever carries the receipt. It reaches him when
 * the two of them settle rather than at the desk, but it is his money either
 * way.
 *
 * So the refund divides exactly as the bill does. A purchase carried alone
 * returns all of its refund; one split down the middle returns half; one the
 * reader merely fronted for somebody else returns none, because none of that
 * cost was ever theirs. The three fall out of the same ratio rather than
 * needing three rules.
 */
export const refundShareRatio = (
  expense: Expense,
  viewerMemberId?: string,
  ownerMemberId?: string,
): number => {
  if (!viewerMemberId) return 1;

  const whole = expenseNetAmount(expense);
  /*
    A bill of nothing cannot be divided, and asking would be a division by
    zero. Nobody is owed a share of a refund on a purchase that cost nothing.
  */
  if (!Number.isFinite(whole) || whole === 0) return 0;

  const mine = expenseCostToViewer(expense, viewerMemberId, ownerMemberId);
  if (!Number.isFinite(mine) || mine <= 0) return 0;

  // Rounding in the split calculator can land a hair over the whole.
  return Math.min(1, mine / whole);
};

/** Whether any of this refund is the reader's at all. */
export const refundConcernsViewer = (
  expense: Expense,
  viewerMemberId?: string,
  ownerMemberId?: string,
): boolean => refundShareRatio(expense, viewerMemberId, ownerMemberId) > 0;
