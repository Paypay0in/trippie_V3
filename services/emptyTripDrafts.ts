import type { TripDraft } from './tripPersistence';

/**
 * Trips that were started and never filled in.
 *
 * 「先把之前的只要是空的都旅程都刪掉吧」, and when asked where the line goes:
 * 「沒有行程、沒有帳、沒有收藏地點」 and 「有名字和日期，但其他都空」 — both of
 * those. So a name, dates, a destination and a cover are not content. They are
 * what creating a trip gives you for free.
 *
 * What counts as content is anything the traveller put there afterwards:
 *
 *   itinerary          stops on a day
 *   expenses           money recorded
 *   savedInspirations  places kept for this trip
 *   shoppingList       things to buy
 *   flightAnchors      a flight, even a half-entered one
 *   carRentals         a car booked
 *   companions         somebody invited — their copy is at stake, not just his
 *   planBrief          he answered 告訴我你的旅行計畫
 *   settlementBatches  a settlement, even one with no bills left on it
 *
 * The list is deliberately long and deliberately generous. This decides what a
 * bulk delete sweeps up, and the two kinds of mistake are not symmetrical: a
 * trip wrongly kept costs one tap, a trip wrongly deleted costs a traveller's
 * record of it. Anything ambiguous counts as content.
 *
 * `companions` is the one worth saying out loud. An empty trip with a friend
 * invited is not only this device's to erase — somebody else accepted it, and
 * that is a reason to leave it alone rather than a field to tidy up.
 */

const has = (list?: unknown[]): boolean => Array.isArray(list) && list.length > 0;

export const tripDraftIsEmpty = (draft: TripDraft): boolean => !(
  has(draft.itinerary)
  || has(draft.expenses)
  || has(draft.savedInspirations)
  || has(draft.shoppingList)
  || has(draft.flightAnchors)
  || has(draft.carRentals)
  || has(draft.companions)
  || has(draft.settlementBatches)
  || Boolean(draft.planBrief)
);

/**
 * The empty ones, in the order they are shown.
 *
 * Returned as drafts rather than ids so the caller can name them in the
 * confirmation. 「delete 7 trips」 is not something anybody can check; 「花蓮,
 * 台南, 未命名的旅程」 is.
 */
export const emptyTripDrafts = (drafts: TripDraft[]): TripDraft[] =>
  drafts.filter(tripDraftIsEmpty);
