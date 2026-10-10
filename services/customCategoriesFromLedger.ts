import { Expense } from '../types';
import { CustomCategories, addCustomCategory } from './customCategories';

/**
 * Categories this device has never heard of, learned from the shared ledger.
 *
 * 「這兩個分類是我分別在電腦與手機創建的 但我目前用手機是看不到用電腦創建的分類」.
 * Custom categories live in localStorage and nothing syncs them, so a category
 * invented on the laptop does not exist on the phone — and the traveller, not
 * finding it, invents it again with slightly different words. 美妝保養品 and
 * 保養美妝品 are the same idea, spent on twice, split across two names that can
 * never be added up.
 *
 * The bills themselves do sync, and every bill carries the name of its
 * category. So the names are already on both devices; only the picker was
 * ignoring them. Adopting the ones it does not recognise is enough to stop the
 * drift, and costs no schema: the ledger is already the thing both phones agree
 * on.
 *
 * A proper synced list is still worth having — this cannot carry a category
 * invented but not yet spent against — but it needs a table, and this does not.
 */
export const adoptCategoriesFromLedger = (
  current: CustomCategories,
  expenses: Expense[],
): CustomCategories => {
  let next = current;
  for (const expense of expenses) {
    const name = typeof expense.category === 'string' ? expense.category.trim() : '';
    if (!name) continue;
    /*
      addCustomCategory is the only judge of what counts as new: it rejects a
      built-in, a duplicate, a blank and anything over the length cap. Deciding
      that here as well would be a second opinion free to disagree with the
      picker's.
    */
    next = addCustomCategory(next, expense.phase, name);
  }
  return next;
};
