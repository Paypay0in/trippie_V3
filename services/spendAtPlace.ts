/**
 * What was actually spent at a saved place.
 *
 * 「這個可以 match 到我收藏的店舖中，能讓收藏清單中看到我在記帳下寫的備註嗎與圖片
 * 嗎？」
 *
 * The collection holds what somebody else said about a place. The ledger holds
 * what it cost when you went — the receipt, the amount, the line you wrote
 * afterwards. They were two piles with nothing between them, and the thing
 * that joins them already exists: a receipt scan records `merchantPlaceId`
 * when the address it read matched the place it found.
 *
 * Matched on that id and on nothing else. Names are not enough and would be
 * actively wrong here: the collection calls this restaurant 「Kurofunetei」 and
 * the receipt calls it 「黑船亭 洋食料理」, so a name rule finds nothing — and a
 * loose one would attach the wrong receipt to the wrong shop, which on a
 * screen about money is worse than showing nothing at all.
 */
import { Expense, SavedTravelInspiration } from '../types';

export interface SpendAtPlace {
  expenseId: string;
  date: string;
  description: string;
  twdAmount: number;
  /** What the traveller typed on the bill afterwards, when they typed any. */
  note?: string;
  /** The first receipt photo, for the thumbnail on the card. */
  photo?: string;
}

const clean = (value?: string): string => (value || '').trim();

/**
 * Every bill recorded at this place, most recent first.
 *
 * Empty when the saved place was never resolved, because then there is no id
 * to match on and matching by name is the thing this refuses to do.
 */
export const spendAtPlace = (
  place: Pick<SavedTravelInspiration, 'placeId'>,
  expenses: Expense[],
): SpendAtPlace[] => {
  const placeId = clean(place.placeId);
  if (!placeId) return [];

  return expenses
    .filter(expense => clean(expense.merchantPlaceId) === placeId)
    .map(expense => ({
      expenseId: expense.id,
      date: expense.date,
      description: expense.description,
      twdAmount: expense.twdAmount,
      ...(clean(expense.note) ? { note: clean(expense.note) } : {}),
      ...(expense.receiptPhotos?.[0] ? { photo: expense.receiptPhotos[0] } : {}),
    }))
    // 「上次在這裡花了多少」 is asked about the last time, not the first.
    .sort((left, right) => right.date.localeCompare(left.date));
};

/** 「NT$ 882」, and 「NT$ 1,456・2 筆」 when somebody went twice. */
export const spendSummary = (spend: SpendAtPlace[]): string => {
  if (spend.length === 0) return '';
  const total = spend.reduce((sum, entry) => sum + (Number.isFinite(entry.twdAmount) ? entry.twdAmount : 0), 0);
  const money = `NT$ ${Math.round(total).toLocaleString()}`;
  return spend.length > 1 ? `${money}・${spend.length} 筆` : money;
};
