/**
 * @vitest-environment jsdom
 *
 * 「他直接跳旅行中 但旅行前的總覽 沒有」.
 *
 * A trip is 旅行中 from its first day, which is right — the first day is the
 * trip. What was wrong is what went with it: at 01:27 on the morning of a
 * 04:35 flight the whole preparation panel disappeared, with items on it still
 * unticked. A checklist that vanishes while it still has work on it is worse
 * than no checklist, because the traveller was using it.
 *
 * It now stays for as long as it has something to say, and goes quiet on its
 * own when everything is done.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';
import { ShoppingItem } from '../types';

const chore = (over: Partial<ShoppingItem>): ShoppingItem => ({
  id: 'c1',
  name: '換韓元',
  phase: 'pre',
  isPurchased: false,
  ...over,
} as ShoppingItem);

const baseProps: Record<string, unknown> = {
  expenses: [],
  itinerary: [],
  companionCount: 1,
  dateRange: '2026/10/20 - 10/24',
  destination: '東京',
  destinationCountry: '日本',
  onContinuePlanning: () => {},
  onEnterTripMode: () => {},
  onExploreInspiration: () => {},
  onManageMembers: () => {},
  passportCountryCode: 'TW',
  communityPosts: [],
  savedInspirations: [],
  onResearchEntryRules: async () => {},
  onSelectPassportCountry: () => {},
  onTogglePreparationItem: () => {},
};

const mount = (over: Record<string, unknown>) => {
  const props = Object.assign({}, baseProps, over) as unknown as React.ComponentProps<typeof TripPlanOverview>;
  render(<TripPlanOverview {...props} />);
};

afterEach(cleanup);

describe('旅程準備度, once the trip has started', () => {
  it('is still there while something is unticked', () => {
    mount({ variant: 'reference', shoppingList: [chore({ isPurchased: false })] });

    expect(screen.getByText('旅程準備度')).toBeTruthy();
    expect(screen.getByText(/還有 1 項/)).toBeTruthy();
  });

  /* Done is done. Nothing to tap to dismiss, and nothing left to nag about. */
  it('goes quiet when everything is done', () => {
    mount({ variant: 'reference', shoppingList: [chore({ isPurchased: true })] });

    expect(screen.queryByText('旅程準備度')).toBeNull();
  });

  it('is always there before departure, even with nothing on it', () => {
    mount({ variant: 'plan', shoppingList: [] });

    expect(screen.getByText('旅程準備度')).toBeTruthy();
  });
});
