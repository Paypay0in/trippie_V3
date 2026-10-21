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
 * hands back different place ids for the same venue often enough — a shop and
 * the building it is in, a branch re-listed — that an id-only rule finds
 * nothing on a perfectly good pair of records. Sixty metres apart in a city is
 * the same door.
 *
 * The third rule is the printed name and the printed address, and I argued
 * against it: 「我的收藏叫 Kurofunetei，收據叫 黑船亭 洋食料理」, and a rule loose
 * enough to join those would also join two different shops. The Founder's
 * answer was 「他有給地址跟店名…你應該是配對那個」, and he is right about the
 * case in front of him — the receipt's own `merchant` field reads
 * 「KUROFUNE-TEI」, which is the same word as the saved 「Kurofunetei」 once the
 * hyphen and the case stop counting. A description is a sentence somebody
 * wrote; a `merchant` is what the till printed.
 *
 * So the name rule is narrow on purpose: the till's name against the place's
 * name, punctuation and case removed, equal or one wholly inside the other,
 * never fewer than four characters. A bill with nothing printed on it at all
 * — typed by hand, no receipt — is read on its description instead, because
 * then that is the only name it has and it is the name the traveller chose
 * for the place they went to. 「Lawson」 would still match every Lawson
 * in Tokyo, which is why the address rule sits beside it rather than under
 * it — a Japanese street number （2-13-13） appearing in both, full-width
 * digits folded, is the shop and not the chain.
 */
import { Expense, ReceiptItem, SavedTravelInspiration } from '../types';
import { distanceInKm } from './tripInspirationSelection';

/** Closer than this and it is the same door. */
const SAME_DOOR_KM = 0.06;

/** Shorter than this and a shared name says nothing. */
const SHORTEST_NAME = 4;

/**
 * A name with nothing in it but the letters.
 *
 * Case, spaces, hyphens, middle dots and full-width punctuation all differ
 * between a till roll and a map listing for the same shop, and none of them
 * is part of what the shop is called.
 */
const nameKey = (value?: string): string =>
  (value || '')
    .toLocaleLowerCase()
    .replace(/[\s\u3000・·.,'"’“”\-–—_()（）【】\[\]]/g, '');

/** Full-width digits are the same numbers. */
const digits = (value: string): string =>
  value.replace(/[０-９]/g, character => String.fromCharCode(character.charCodeAt(0) - 0xfee0));

/**
 * The street numbers in an address, as they would be read aloud.
 *
 * 「2-13-13」 in 東京都台東区上野2-13-13キクヤビル4F, and the same run inside a map
 * listing's 上野２丁目13−13. The run is what identifies the building; the words
 * around it are written differently by everybody.
 */
const streetNumbers = (value?: string): string[] => {
  const normalised = digits(value || '').replace(/[−‐‑‒–—]/g, '-');
  const runs: string[] = normalised.match(/\d+(?:-\d+)+/g) ?? [];
  return runs.filter(run => run.length >= 4);
};

export interface SpendAtPlace {
  expenseId: string;
  date: string;
  description: string;
  twdAmount: number;
  /** What the traveller typed on the bill afterwards, when they typed any. */
  note?: string;
  /** The first receipt photo, for the thumbnail on the card. */
  photo?: string;
  /**
   * Every receipt photo, for the card that opens when the row is tapped.
   *
   * 「點擊下去要有小卡片：照片與當初記帳的備註，還有實際的結帳細目！」 — the
   * thumbnail answers 「did I go」; opening it answers 「what did I actually
   * order」, which is the question somebody asks a year later.
   */
  photos?: string[];
  /** The receipt's own lines, exactly as they were read off the paper. */
  items?: ReceiptItem[];
  /** What the till charged, in the money it charged in. */
  amountOriginal?: number;
  currency?: string;
  /** The rate that day, so a printed line can be read in both monies. */
  exchangeRate?: number;
  /** The shop as printed, which is rarely what the collection calls it. */
  merchant?: string;
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
  place: Pick<SavedTravelInspiration, 'placeId' | 'latitude' | 'longitude' | 'placeName' | 'resolvedPlaceName' | 'formattedAddress'>,
  expenses: Expense[],
): SpendAtPlace[] => {
  const placeId = clean(place.placeId);
  const here = typeof place.latitude === 'number' && typeof place.longitude === 'number'
    && !(place.latitude === 0 && place.longitude === 0)
    ? { latitude: place.latitude, longitude: place.longitude }
    : undefined;
  // Nothing structured and nothing printed is nothing to match on.
  if (!placeId && !here && !clean(place.placeName) && !clean(place.formattedAddress)) return [];

  const sameDoor = (expense: Expense): boolean => {
    if (!here) return false;
    const lat = expense.merchantLatitude;
    const lng = expense.merchantLongitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (lat === 0 && lng === 0) return false;
    return distanceInKm(here, { latitude: lat, longitude: lng }) <= SAME_DOOR_KM;
  };

  /*
    The till's name against the place's name — not the description, which is
    a sentence somebody wrote and is routinely the dish rather than the shop.
  */
  const savedNames = [place.placeName, place.resolvedPlaceName]
    .map(nameKey)
    .filter(name => name.length >= SHORTEST_NAME);
  const sameName = (expense: Expense): boolean => {
    /*
      The till's name, or the traveller's own when there was no till.

      「這個本來不是可以 match 收藏清單了嗎」 — about 八十八淺草抹茶🍵, typed by
      hand. A `description` is excluded on a scanned receipt because it is
      routinely the dish rather than the shop; on a bill with nothing printed
      on it at all, it is the only name there is, and it is the name the
      traveller chose for the place they went to.

      So the exclusion holds exactly where its reason holds: a bill that has a
      `merchant` is judged on the `merchant` alone.
    */
    const printed = nameKey(expense.merchant) || nameKey(expense.description);
    if (printed.length < SHORTEST_NAME) return false;
    return savedNames.some(name => name === printed || name.includes(printed) || printed.includes(name));
  };

  const savedNumbers = streetNumbers(place.formattedAddress);
  const sameBuilding = (expense: Expense): boolean => {
    if (savedNumbers.length === 0) return false;
    const printed = streetNumbers(expense.merchantAddress);
    /*
      One run may carry a block number the other leaves out: a map listing
      says 上野２丁目13−13 and a receipt says 上野2-13-13, which is 13-13 inside
      2-13-13. Matched when one run ends with the other, so the finer address
      is allowed to be more specific than the coarser one without the two
      being read as different buildings.
    */
    return printed.some(run => savedNumbers.some(known =>
      run === known || run.endsWith(`-${known}`) || known.endsWith(`-${run}`)));
  };

  return expenses
    .filter(expense => (placeId && clean(expense.merchantPlaceId) === placeId)
      || sameDoor(expense)
      || sameName(expense)
      || sameBuilding(expense))
    .map(expense => ({
      expenseId: expense.id,
      date: expense.date,
      description: expense.description,
      twdAmount: expense.twdAmount,
      ...(clean(expense.note) ? { note: clean(expense.note) } : {}),
      ...(expense.receiptPhotos?.[0] ? { photo: expense.receiptPhotos[0] } : {}),
      ...(expense.receiptPhotos?.length ? { photos: expense.receiptPhotos } : {}),
      ...(expense.receiptItems?.length ? { items: expense.receiptItems } : {}),
      // `amount` is what the till charged, in `currency`; `twdAmount` is that
      // converted. There is no separate original-amount field.
      ...(typeof expense.amount === 'number' ? { amountOriginal: expense.amount } : {}),
      ...(clean(expense.currency) ? { currency: clean(expense.currency) } : {}),
      ...(typeof expense.exchangeRate === 'number' && expense.exchangeRate > 0
        ? { exchangeRate: expense.exchangeRate } : {}),
      ...(clean(expense.merchant) ? { merchant: clean(expense.merchant) } : {}),
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
