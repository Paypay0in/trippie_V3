import { TripDraft } from './tripPersistence';

/**
 * What tells one trip on the shelf apart from another.
 *
 * Two 釜山 sat side by side for three days: same name, same cover image, same
 * blank date line — one shared and holding 23 plans and 3 bills, one solo and
 * empty. The second traveller opened the empty one every time and reported
 * 「完全不同步」, and the advice given back was 「打開有內容的那個」, which asks
 * her to know something the screen never said.
 *
 * So the screen says it. Whether a trip is shared is the fact that matters —
 * it is the reason the other person's plans would be in it — and emptiness is
 * what makes the wrong one wrong.
 */
export interface TripShelfBadge {
  /** 共用 / 只有你 — stated first, because it is what the traveller is choosing between. */
  sharing: string;
  /** What is inside, or that nothing is. Omitted when the trip has content worth no comment. */
  contents: string;
  /** True for a trip more than one person is in. */
  shared: boolean;
}

/** Everyone on the trip besides the owner, counted once. */
const travellerCount = (draft: TripDraft): number => {
  const ids = new Set((draft.companions || []).map(companion => companion.id));
  return ids.size + 1;
};

export const tripShelfBadge = (draft: TripDraft): TripShelfBadge => {
  const people = travellerCount(draft);
  const shared = people > 1;
  const plans = (draft.itinerary || []).length;
  const bills = (draft.expenses || []).length;

  const contents = plans === 0 && bills === 0
    ? '還是空的'
    : plans > 0
      ? `${plans} 個行程`
      : `${bills} 筆帳`;

  return {
    shared,
    sharing: shared ? `共用 · ${people} 人` : '只有你',
    contents,
  };
};

/** One line, for the places that have room for only one. */
export const tripShelfBadgeText = (draft: TripDraft): string => {
  const badge = tripShelfBadge(draft);
  return `${badge.sharing} · ${badge.contents}`;
};
