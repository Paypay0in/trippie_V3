import { describe, expect, it } from 'vitest';
import { emptyTripDrafts, tripDraftIsEmpty } from '../services/emptyTripDrafts';
import type { TripDraft } from '../services/tripPersistence';

/**
 * 「先把之前的只要是空的都旅程都刪掉吧」, and where the line goes:
 * 「沒有行程、沒有帳、沒有收藏地點」 plus 「有名字和日期，但其他都空」 — both.
 *
 * What is pinned here is mostly the NOT-empty half, because the two mistakes
 * are not the same size. A trip wrongly kept costs one tap. A trip wrongly
 * swept costs a traveller the record of it, and this is the only control in
 * the app that removes several at once.
 */

const draft = (over: Partial<TripDraft> = {}): TripDraft => ({
  id: 't1',
  name: '花蓮',
  startDate: '2026-12-01',
  endDate: '2026-12-03',
  expenses: [],
  companions: [],
  shoppingList: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('a trip nobody filled in', () => {
  it('is empty even with a name, dates, a destination and a cover', () => {
    // Explicitly the Founder's second case. These are what creating a trip
    // hands you; none of them is something the traveller put there.
    expect(tripDraftIsEmpty(draft({
      destination: '花蓮',
      destinationCountry: '台灣',
      destinationPlaceId: 'ChIJ-abc',
      budget: 20000,
      currency: 'TWD',
      tripScope: 'domestic',
      tripTransport: ['train'],
    }))).toBe(true);
  });
});

describe('what counts as content', () => {
  const content: Array<[string, Partial<TripDraft>]> = [
    ['an itinerary stop', { itinerary: [{ id: 'i1' } as never] }],
    ['a recorded expense', { expenses: [{ id: 'e1' } as never] }],
    ['a saved place', { savedInspirations: [{ id: 's1' } as never] }],
    ['something to buy', { shoppingList: [{ id: 'g1' } as never] }],
    ['a flight, even half-entered', { flightAnchors: [{ id: 'f1' } as never] }],
    ['a car booked', { carRentals: [{ company: 'x' } as never] }],
    ['a companion invited', { companions: [{ id: 'c1' } as never] }],
    ['a settlement batch', { settlementBatches: [{ id: 'b1' } as never] }],
    ['the plan brief he answered', { planBrief: { transport: [] } as never }],
  ];

  it.each(content)('keeps a trip that has %s', (_label, over) => {
    expect(tripDraftIsEmpty(draft(over))).toBe(false);
  });

  it('keeps a trip with a companion even though nothing else is on it', () => {
    // Said twice on purpose. An invited friend accepted something, so this
    // trip is not only this device's to erase.
    expect(tripDraftIsEmpty(draft({ companions: [{ id: 'c1' } as never] }))).toBe(false);
  });
});

describe('picking them out of a list', () => {
  it('returns only the empty ones, in the order given', () => {
    const list = [
      draft({ id: 'a' }),
      draft({ id: 'b', itinerary: [{ id: 'i' } as never] }),
      draft({ id: 'c' }),
    ];
    expect(emptyTripDrafts(list).map(entry => entry.id)).toEqual(['a', 'c']);
  });

  it('returns nothing for a list with no empty trips', () => {
    expect(emptyTripDrafts([draft({ expenses: [{ id: 'e' } as never] })])).toEqual([]);
  });
});
