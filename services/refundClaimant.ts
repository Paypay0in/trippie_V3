import { Expense } from '../types';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * Whose refund a purchase's refund is.
 *
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」.
 *
 * The refund list was drawn from everything that concerns the reader, and a
 * bill someone else paid concerns you the moment you are split in on it. So
 * Gina's 75,900 KRW of 藥品 appeared on North's recap offering him 4,554 KRW
 * back — money that will be handed to whoever carries that receipt to the
 * refund desk, which is Gina.
 *
 * Sharing the cost of something and being able to claim its tax back are two
 * different facts. The second follows the receipt, and the receipt follows the
 * person who paid. Being split in on a purchase gives you a share of what it
 * cost; it gives you no claim on the counter.
 *
 * Unattributed records stay claimable, for the same reason they stay visible:
 * a ledger that quietly drops what it cannot classify is worse than one that
 * shows too much, and a solo trip names nobody anywhere.
 */
export const refundClaimableBy = (
  expense: Expense,
  viewerMemberId?: string,
  ownerMemberId?: string,
): boolean => {
  if (!viewerMemberId) return true;
  const me = normalizeOwnerMemberId(viewerMemberId, ownerMemberId || '');

  /*
    More than one person put money down, so more than one receipt exists. The
    reader holds one of them if they fronted any of it.
  */
  const prepaid = expense.payerAllocations || {};
  if (Object.keys(prepaid).length > 1) {
    const paid = prepaid[viewerMemberId] ?? prepaid[me];
    return typeof paid === 'number' && paid !== 0;
  }

  if (expense.payerId) {
    return normalizeOwnerMemberId(expense.payerId, ownerMemberId || '') === me;
  }

  const soleEntry = Object.keys(prepaid)[0];
  if (soleEntry) {
    return normalizeOwnerMemberId(soleEntry, ownerMemberId || '') === me;
  }

  // Nobody paid it on record: not somebody else's receipt, just an unattributed one.
  return true;
};

/** The purchases whose tax this reader could actually go and claim. */
export const refundClaimableExpenses = (
  expenses: Expense[],
  viewerMemberId?: string,
  ownerMemberId?: string,
): Expense[] =>
  expenses.filter(expense => refundClaimableBy(expense, viewerMemberId, ownerMemberId));
