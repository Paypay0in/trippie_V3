import { Expense } from '../types';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * Whose errand the refund is.
 *
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」, and then the rule that
 * settles it: 「退稅的行為人依然是付總額的人 ... 該退稅不是計入分帳者的退稅總額
 * 是變成在結算時的減掉的金額」.
 *
 * Two different things were being conflated into one list. Standing at the
 * refund desk is an errand, and the person who can do it is the one holding
 * the receipt — whoever paid the whole bill. Benefiting from the money is
 * separate, and a sharer does benefit: half of Gina's 藥品 is North's, so half
 * of what the counter returns is his.
 *
 * He just does not collect it. It reaches him as a smaller bill at settlement,
 * which the ledger already does on its own: a refund recorded against a
 * purchase comes off that purchase before it is split, so both sides' share of
 * it falls proportionally. See `expenseNetAmount`.
 *
 * So this list answers only the first question — what the reader should go and
 * claim. Putting a sharer's portion here would promise them a second queue at
 * Gimhae for money that is already on its way to them by another road, and
 * would count one receipt twice across the two recaps.
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
    reader has an errand if they fronted any of it.
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
