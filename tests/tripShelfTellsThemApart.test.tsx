/**
 * @vitest-environment jsdom
 *
 * 「按你這個邏輯他每次都看錯啊」
 *
 * Two trips named 釜山 sat on the second traveller's shelf for three days: the
 * shared one holding 23 plans, 3 bills and 2 people, and one of her own with no
 * dates and nothing in it. Same name, same cover, same blank date line. She
 * opened the empty one every time and reported 「完全不同步」, and the answer
 * given back was 「打開有內容的那個」 — which asks her to know something the
 * screen never told her.
 *
 * Both trips here are the real pair, by id and by contents.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import { tripShelfBadge, tripShelfBadgeText } from '../services/tripShelfBadge';
import type { TripDraft } from '../services/tripPersistence';

const SHARED = 'muo3ht39hl3hpfed';
const HER_EMPTY = 'muobt0jqy9o6gn1h';

const draft = (over: Partial<TripDraft>): TripDraft => ({
  id: 'x', name: '釜山', startDate: '', endDate: '',
  expenses: [], companions: [], shoppingList: [], itinerary: [],
  createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
  ...over,
} as TripDraft);

const sharedBusan = draft({
  id: SHARED,
  startDate: '2026-10-02',
  endDate: '2026-10-07',
  companions: [{ id: 'muoal9czpaxkzw1l', name: 'Gina', userId: 'her-account', type: 'member' }] as never,
  itinerary: Array.from({ length: 23 }, (_, i) => ({ id: `i-${i}` })) as never,
  expenses: Array.from({ length: 3 }, (_, i) => ({ id: `e-${i}` })) as never,
});

const herEmptyBusan = draft({ id: HER_EMPTY });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the two trips called 釜山', () => {
  it('say which one other people are in, and which one is empty', () => {
    expect(tripShelfBadgeText(sharedBusan)).toBe('共用 · 2 人 · 23 個行程');
    expect(tripShelfBadgeText(herEmptyBusan)).toBe('只有你 · 還是空的');
  });

  it('never read the same, which is the whole point', () => {
    expect(tripShelfBadgeText(sharedBusan)).not.toBe(tripShelfBadgeText(herEmptyBusan));
    expect(tripShelfBadge(sharedBusan).shared).toBe(true);
    expect(tripShelfBadge(herEmptyBusan).shared).toBe(false);
  });

  it('counts bills when a trip has money in it but nothing planned yet', () => {
    const justBills = draft({ id: 'b', expenses: [{ id: 'e-1' }, { id: 'e-2' }] as never });
    expect(tripShelfBadgeText(justBills)).toBe('只有你 · 2 筆帳');
  });
});

describe('the shelf she actually looks at', () => {
  const mount = () => render(
    <TravelHome
      activeSection="trip"
      onSectionChange={() => undefined}
      onPlus={() => undefined}
      drafts={[sharedBusan, herEmptyBusan]}
      tripHistory={[]}
      activeDraftId={SHARED}
      onContinueDraft={() => undefined}
      onContinueTrip={() => undefined}
      onCreateNew={() => undefined}
      onOpenPlanner={() => undefined}
      savedTravelInspirations={[]}
      communityPosts={[]}
      onOpenSavedDestination={() => undefined}
      authStatus="authenticated"
    />,
  );

  it('states it on the open trip and on the one beside it', () => {
    mount();
    expect(screen.getByTestId(`trip-shelf-badge-${SHARED}`).textContent).toContain('共用 · 2 人');
    expect(screen.getByTestId(`trip-shelf-badge-${HER_EMPTY}`).textContent).toContain('只有你');
    expect(screen.getByTestId(`trip-shelf-badge-${HER_EMPTY}`).textContent).toContain('還是空的');
  });
});
