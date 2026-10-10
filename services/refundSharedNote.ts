import { Expense } from '../types';
import { expenseCostToViewer, expenseNetAmount } from './viewerSpend';

/**
 * Whether this receipt is carrying somebody else's money too.
 *
 * 「退稅的行為人依然是付總額的人 ... 該退稅不是計入分帳者的退稅總額 是變成在結算時
 * 的減掉的金額」.
 *
 * The reader collects the whole refund, because they hold the whole receipt.
 * But on a bill they split, not all of it stays with them: the part matching
 * their travel companion's share comes off what that companion owes when the
 * two of them settle.
 *
 * Worth saying on the row. Someone who queues at Gimhae, is handed 4,554 won
 * and later finds only half of it improved their own position has been told
 * the truth twice and understood it once.
 */
export const sharedWithSomebody = (
  expense: Expense,
  viewerMemberId?: string,
  ownerMemberId?: string,
): boolean => {
  if (!viewerMemberId) return false;
  const whole = expenseNetAmount(expense);
  if (!Number.isFinite(whole) || whole <= 0) return false;
  const mine = expenseCostToViewer(expense, viewerMemberId, ownerMemberId);
  if (!Number.isFinite(mine)) return false;
  // A hair under the whole is rounding in the split calculator, not a share.
  return mine < whole - 0.5;
};
