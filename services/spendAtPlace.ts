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
 * Matched on that id, or on the two of them standing in the same spot. Never
 * on the name: the collection calls this restaurant 「Kurofunetei」 and the
 * receipt calls it 「黑船亭 洋食料理」, so a name rule finds nothing here — and a
 * loose one would attach the wrong receipt to the wrong shop, which on a
 * screen about money is worse than showing nothing at all.
 *
 * The position is a second structured answer rather than a softer one. Google
 * hands back different place ids for the same venue often enough —  a shop
 * and the building it is in, a branch re-listed — that an id-only rule finds
 * nothing on a perfectly good pair of records. Sixty metres apart in a city is
 * the same door; it is not 「probably the same kind of place」, which is what a
 * name would have been.
 */
import { Expense, SavedTravelInspiration } from '../types';
import { distanceInKm } from './tripInspirationSelection';

/** Closer than this and it is the same door. */
const SAME_DOOR_KM = 0.06;

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
 * Empty when the saved place has neither an id nor a position, because then
 * there is nothing structured to match on — and matching by name is the thing
 * this refuses to do.
 */
export const spendAtPlace = (
  place: Pick<SavedTravelInspiration, 'placeId' | 'latitude' | 'longitude'>,
  expenses: Expense[],
): SpendAtPlace[] => {
  const placeId = clean(place.placeId);
  const here = typeof place.latitude === 'number' && typeof place.longitude === 'number'
    && !(place.latitude === 0 && place.longitude === 0)
    ? { latitude: place.latitude, longitude: place.longitude }
    : undefined;
  if (!placeId && !here) return [];

  const sameDoor = (expense: Expense): boolean => {
    if (!here) return false;
    const lat = expense.merchantLatitude;
    const lng = expense.merchantLongitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (lat === 0 && lng === 0) return false;
    return distanceInKm(here, { latitude: lat, longitude: lng }) <= SAME_DOOR_KM;
  };

  return expenses
    .filter(expense => (placeId && clean(expense.merchantPlaceId) === placeId) || sameDoor(expense))
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
