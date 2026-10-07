import { Expense } from '../types';

/**
 * The same purchase, photographed twice.
 *
 * 「一張是店家票據 一張是信用卡收據 會被建立成兩筆 因此AI要判斷有無可能是同一筆」.
 * A shop hands over a till receipt and the card terminal prints a slip, and a
 * traveller emptying their pocket into the batch reader photographs both. Two
 * bills for one purchase inflates the trip's total and, on a shared ledger,
 * what somebody else owes.
 *
 * Matched on facts, not on resemblance. Same currency, same amount, same day —
 * or a day apart, for a till that closed after midnight. Asking a model whether
 * two receipts 「feel like」 the same purchase gets two genuinely separate bills
 * of the same price merged, and a real bill quietly deleted is far harder to
 * notice than a duplicate left in.
 */

export type DuplicateConfidence = 'same_day' | 'next_day';

export interface DuplicatePair {
  /** The reading that should survive — the one carrying more of the purchase. */
  keep: Expense;
  /** The reading folded into it. */
  drop: Expense;
  confidence: DuplicateConfidence;
  /** True when `keep` is a bill already in the ledger rather than a new reading. */
  againstExisting: boolean;
}

const dayNumber = (date: string): number | undefined => {
  const parsed = Date.parse(`${date}T00:00:00`);
  return Number.isNaN(parsed) ? undefined : Math.round(parsed / 86400000);
};

/** Two readings of one purchase, or two purchases that cost the same. */
const looksLikeSamePurchase = (
  left: Expense,
  right: Expense,
): DuplicateConfidence | undefined => {
  if ((left.currency || '') !== (right.currency || '')) return undefined;
  // The amount as printed, not the converted one: two receipts in KRW convert
  // through the same rate, but a rate that moved between imports would hide a
  // match that the paper makes obvious.
  if (Math.round(left.amount) !== Math.round(right.amount)) return undefined;
  if (Math.round(left.amount) === 0) return undefined;

  const leftDay = dayNumber(left.date);
  const rightDay = dayNumber(right.date);
  if (leftDay === undefined || rightDay === undefined) return undefined;

  const apart = Math.abs(leftDay - rightDay);
  if (apart === 0) return 'same_day';
  if (apart === 1) return 'next_day';
  return undefined;
};

/**
 * Which of two readings carries more of the purchase.
 *
 * The till receipt lists what was bought, names the shop and may record the tax
 * already refunded; the card slip is a total and four digits. Keeping the
 * richer one means the merge loses nothing but the duplicate.
 */
const richness = (expense: Expense): number =>
  (expense.receiptItems?.length ? 2 : 0)
  + (expense.merchant ? 1 : 0)
  + (expense.merchantAddress ? 1 : 0)
  + (expense.taxRefundedAtPurchase ? 1 : 0);

/**
 * Pairs worth asking about, newest reading first.
 *
 * Both directions are checked: against the rest of this batch, and against what
 * the ledger already holds — a bill entered by hand at the counter and then
 * photographed again that evening is the same mistake arriving by a different
 * route.
 *
 * Each incoming reading is paired at most once. A receipt matching three others
 * is one decision to make, not three.
 */
export const findDuplicateReceipts = ({
  incoming,
  existing = [],
}: {
  incoming: Expense[];
  existing?: Expense[];
}): DuplicatePair[] => {
  const pairs: DuplicatePair[] = [];
  const spoken = new Set<string>();

  incoming.forEach((candidate, index) => {
    if (spoken.has(candidate.id)) return;

    // The ledger first: a match there is the stronger statement, because that
    // bill is already counted in every total on every screen.
    for (const held of existing) {
      const confidence = looksLikeSamePurchase(candidate, held);
      if (!confidence) continue;
      pairs.push({ keep: held, drop: candidate, confidence, againstExisting: true });
      spoken.add(candidate.id);
      return;
    }

    for (const other of incoming.slice(index + 1)) {
      if (spoken.has(other.id)) continue;
      const confidence = looksLikeSamePurchase(candidate, other);
      if (!confidence) continue;
      const [keep, drop] = richness(other) > richness(candidate)
        ? [other, candidate]
        : [candidate, other];
      pairs.push({ keep, drop, confidence, againstExisting: false });
      spoken.add(candidate.id);
      spoken.add(other.id);
      return;
    }
  });

  return pairs;
};

/**
 * One reading folded into another.
 *
 * The card slip is not thrown away — its photograph joins the bill it belongs
 * to, because the thing somebody checks a merged record against is the slip.
 * Anything the surviving reading lacks and the other one has is carried over.
 */
export const mergeDuplicate = (keep: Expense, drop: Expense): Expense => ({
  ...keep,
  /*
    Everything either reading knew.

    「兩筆資料是結合兩個的資訊儲存 比方說A有帳目明細 要補去沒有的那份」. The two
    photographs are of one purchase but they do not say the same things: the
    till receipt lists the products, names the shop and prints the refund; the
    card slip is the one that actually knows it went on a card. Taking the
    richer record wholesale would throw away whatever only the other one had.

    The survivor wins every field it has an answer for; the other fills the
    blanks. Amount, date and currency are deliberately not merged — they were
    equal, which is why these two were paired at all.
  */
  description: keep.description?.trim() || drop.description,
  merchant: keep.merchant || drop.merchant,
  merchantAddress: keep.merchantAddress || drop.merchantAddress,
  merchantPlaceId: keep.merchantPlaceId || drop.merchantPlaceId,
  merchantLatitude: keep.merchantLatitude ?? drop.merchantLatitude,
  merchantLongitude: keep.merchantLongitude ?? drop.merchantLongitude,
  receiptItems: keep.receiptItems?.length ? keep.receiptItems : drop.receiptItems,
  taxRefundedAtPurchase: keep.taxRefundedAtPurchase || drop.taxRefundedAtPurchase,
  taxRefundActual: keep.taxRefundActual ?? drop.taxRefundActual,
  /*
    How it was paid is the slip's own subject.

    A store receipt read as cash and a card slip for the same purchase cannot
    both be right, and only one of them is a record of the payment.
  */
  paymentMethod: keep.paymentMethod || drop.paymentMethod,
  note: [keep.note?.trim(), drop.note?.trim()].filter(Boolean).join('\n') || undefined,
  linkedShoppingItemId: keep.linkedShoppingItemId || drop.linkedShoppingItemId,
  /*
    Doubt survives a merge.

    If either reading was unsure of what it saw, the bill that comes out of
    them is still worth a second look; clearing the flag because the other copy
    happened to be confident hides the one record that wanted checking.
  */
  needsReview: Boolean(keep.needsReview || drop.needsReview),
  // Both photographs stay: a merged record is checked against the card slip.
  receiptPhotos: [...(keep.receiptPhotos || []), ...(drop.receiptPhotos || [])],
});

/** How a pair reads to the person deciding. */
export const describeDuplicate = (pair: DuplicatePair): string =>
  pair.confidence === 'same_day'
    ? '同一天、同金額，很可能是同一筆'
    : '金額相同、日期差一天，可能是同一筆';
