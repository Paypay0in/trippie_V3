import { Expense } from '../types';

/**
 * Which bills belong on a settlement screen at all.
 *
 * 「不應該可以看到他的帳」「只能看到有分帳的清單才對」. The picker was handed the
 * whole trip ledger, so a coffee the other traveller bought alone sat in the
 * list beside the taxi you split — hers to account for, nobody else's business,
 * and offered up to be ticked into a settlement it has no part in.
 *
 * A bill is here only if settling it means money moving between two people.
 * One person paying for themselves is a complete transaction already.
 */

const involvedMemberIds = (expense: Expense): Set<string> => {
  const ids = new Set<string>();
  if (expense.payerId) ids.add(expense.payerId);
  (expense.beneficiaries || []).forEach(id => id && ids.add(id));
  Object.entries(expense.payerAllocations || {}).forEach(([id, amount]) => {
    if (id && Number.isFinite(amount) && amount !== 0) ids.add(id);
  });
  Object.entries(expense.splitAllocations || {}).forEach(([id, amount]) => {
    if (id && Number.isFinite(amount) && amount !== 0) ids.add(id);
  });
  return ids;
};

/** True when more than one person has a stake in this bill. */
export const isSharedExpense = (expense: Expense): boolean =>
  involvedMemberIds(expense).size > 1;

/** True when this person has a stake in this bill. */
export const involvesMember = (expense: Expense, memberId: string): boolean =>
  involvedMemberIds(expense).has(memberId);

/**
 * The ledger as a settlement screen should show it to one person.
 *
 * Two conditions, and 「跟你無關的才藏」 is the second of them. A bill the other
 * two split between themselves is shared, and still none of this viewer's
 * business; a bill they bought alone is nobody's to settle. What is left is
 * exactly the set this person could owe or be owed on — which is also the set
 * they must be able to read, because a split nobody can check is not a ledger,
 * it is a claim.
 *
 * Returned unchanged when nothing is removed, so the common case costs no new
 * array. Without a viewer the whole ledger is returned rather than an empty
 * list: an unknown seat is a reason to show no less, not to hide everything.
 */
export const settlementExpensesFor = (
  expenses: Expense[],
  viewerMemberId?: string,
): Expense[] => {
  const visible = expenses.filter(expense =>
    isSharedExpense(expense)
    && (!viewerMemberId || involvesMember(expense, viewerMemberId)),
  );
  return visible.length === expenses.length ? expenses : visible;
};
