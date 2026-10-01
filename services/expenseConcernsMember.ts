import { Expense } from '../types';

/**
 * Whether an expense is any of this member's business.
 *
 * A shared ledger is not a shared feed. 「這個帳若不是我花費的，根本不需要出現
 * 在我的帳上」 — and the sharper version of that: it needs to appear when the
 * two of you have to settle it, and not otherwise. Something she bought for
 * herself is hers, and putting it in his wallet does not make the trip easier
 * to account for; it makes his own total wrong.
 *
 * Four ways a record can concern somebody, and a deliberate fifth case:
 *   paid it, paid part of it, is being split in on it, carries an explicit
 *   share of it — and a record that names nobody at all, which is shown rather
 *   than hidden, because a ledger that quietly drops what it cannot classify
 *   is worse than one that shows too much.
 */
export const expenseConcernsMember = (expense: Expense, memberId: string | undefined): boolean => {
  if (!memberId) return true;

  if (expense.payerId === memberId) return true;

  const paid = expense.payerAllocations?.[memberId];
  if (typeof paid === 'number' && paid !== 0) return true;

  if (Array.isArray(expense.beneficiaries) && expense.beneficiaries.includes(memberId)) return true;

  const share = expense.splitAllocations?.[memberId];
  if (typeof share === 'number' && share !== 0) return true;

  // Nobody is named anywhere: not somebody else's, just unattributed.
  const namesSomebody = Boolean(expense.payerId)
    || Object.keys(expense.payerAllocations || {}).length > 0
    || (expense.beneficiaries?.length || 0) > 0
    || Object.keys(expense.splitAllocations || {}).length > 0;
  return !namesSomebody;
};

/** Split a ledger into what this member has to care about, and what they do not. */
export const partitionByConcern = (
  expenses: Expense[],
  memberId: string | undefined,
): { mine: Expense[]; others: Expense[] } => {
  const mine: Expense[] = [];
  const others: Expense[] = [];
  expenses.forEach(expense => {
    (expenseConcernsMember(expense, memberId) ? mine : others).push(expense);
  });
  return { mine, others };
};
