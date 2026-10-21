/**
 * Things on the shopping list that a receipt says were bought.
 *
 * 「之後若用戶拍收據的時候 就要自動對比購物清單中的東西是否已經買到」.
 *
 * The comparison is automatic; the ticking is not. A receipt line matching a
 * list row is evidence, not a statement — and the cost of the two mistakes is
 * not symmetric. An unticked row that was bought costs a glance at the
 * shelf; a ticked row that was not costs the trip home without the thing.
 *
 * So this finds and offers. The traveller taps, which is the same rule the
 * ticket list settled on: a to-do list records what the traveller says.
 *
 * Matched on the name with spacing and case removed, which is the rule
 * `mergeShoppingItems` already uses — imported rather than restated, because
 * two ideas of 「the same product」 is how a list comes to disagree with
 * itself.
 */
import { Category, Expense, ShoppingItem } from '../types';
import { shoppingNameKey } from './shoppingFromScreenshots';

/**
 * The categories where a bill's own title names a thing rather than a meal.
 *
 * 「我覺得可以用購物這個類目再比」 — and that is the gate that makes the
 * looser comparison safe. A typed bill has no printed lines, so its
 * `description` is the only name it has; comparing that against the list in
 * general would match 「黑船亭 洋食料理」 to something somebody wants to buy.
 * Filed under 購物 it cannot: a 餐飲 bill is excluded by the category it is
 * already in.
 */
const BUYING: string[] = [Category.SHOPPING, Category.SHOPPING_PRE, Category.SOUVENIR];

/** Shorter than this and a shared name says nothing. 「水」 is not a match. */
const SHORTEST_NAME = 3;

export interface BoughtMatch {
  item: ShoppingItem;
  /** The receipt line that matched, as it was printed. */
  line: string;
  /** Which bill it was on, so the offer can point at it. */
  expenseId: string;
  date: string;
}

/**
 * Every unbought list row that a receipt line names.
 *
 * Only rows still waiting: a row already ticked has nothing to offer, and
 * re-offering it would be the screen asking about a decision already made.
 */
export const boughtFromReceipts = (
  shoppingList: ShoppingItem[],
  expenses: Expense[],
): BoughtMatch[] => {
  const waiting = shoppingList.filter(item => !item.isPurchased && item.name.trim().length >= SHORTEST_NAME);
  if (waiting.length === 0) return [];

  const matches: BoughtMatch[] = [];

  expenses.forEach(expense => {
    /*
      The printed lines, plus the bill's own title when it is filed as
      shopping. A till roll names what was bought; so does 「SK-II 青春露」
      typed into a 購物 bill, and that is the only name such a bill has.
    */
    const lines = [
      ...(expense.receiptItems ?? []),
      ...(BUYING.includes(expense.category as string) && expense.description
        ? [{ name: expense.description }]
        : []),
    ];

    lines.forEach(line => {
      const printed = [line.name, line.translatedName]
        .map(value => shoppingNameKey(value || ''))
        .filter(value => value.length >= SHORTEST_NAME);
      if (printed.length === 0) return;

      waiting.forEach(item => {
        if (matches.some(found => found.item.id === item.id)) return;
        const wanted = shoppingNameKey(item.name);
        /*
          Either wholly inside the other: a till prints 「SK-IIﾌｪｲｼｬﾙﾄﾘｰﾄﾒﾝﾄ
          ｴｯｾﾝｽ230ML」 for a row that says 「SK-II 青春露」, and a row that says
          「東京芭娜娜」 appears on a line that says 「東京ばな奈 8入」.
        */
        if (!printed.some(value => value === wanted || value.includes(wanted) || wanted.includes(value))) return;
        matches.push({
          item,
          line: line.translatedName || line.name,
          expenseId: expense.id,
          date: expense.date,
        });
      });
    });
  });

  return matches;
};
