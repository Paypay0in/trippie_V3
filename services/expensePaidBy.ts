import { Expense } from '../types';

/**
 * What one member actually paid on an expense.
 *
 * A shared trip shows everybody's spending, which is the point — you cannot
 * settle up against a ledger that hides half of it. What it must not do is
 * present the trip's total as one person's: 「已支出 NT$ 13,388」 on a screen
 * belonging to someone who had paid 12,500 of it, with the other 888 recorded
 * by the traveller beside him.
 *
 * `payerAllocations` wins when it is present, because a split bill has no
 * single payer. `payerId` is the simple case, and legacy records that carry
 * neither are attributed to nobody rather than guessed at.
 */
export const paidByMember = (expense: Expense, memberId: string | undefined): number => {
  if (!memberId) return 0;

  const allocations = expense.payerAllocations;
  if (allocations && Object.keys(allocations).length > 0) {
    const share = allocations[memberId];
    return typeof share === 'number' && Number.isFinite(share) ? share : 0;
  }

  return expense.payerId === memberId ? expense.amount : 0;
};

/** The same question across a list, in one pass. */
export const totalPaidByMember = (expenses: Expense[], memberId: string | undefined): number =>
  expenses.reduce((sum, expense) => sum + paidByMember(expense, memberId), 0);
