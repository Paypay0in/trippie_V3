/**
 * @vitest-environment jsdom
 *
 * 「產出之後不該再能夠按查詢」.
 *
 * The Korea lookup came back with a summary and no required formalities, and
 * the panel then showed the first-time 查詢入境規定 call to action directly above
 * its own result — which sat underneath as 注意事項. Pressing it produced the
 * same nothing. One screen said both 「this has never been looked up」 and, two
 * inches lower, what the lookup had found.
 *
 * Finding nothing is an answer. It has to read as one.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

const baseProps = {
  expenses: [],
  shoppingList: [],
  itinerary: [],
  companionCount: 1,
  dateRange: '2026/10/02 - 10/07',
  onContinuePlanning: () => {},
  onEnterTripMode: () => {},
  onExploreInspiration: () => {},
  onManageMembers: () => {},
  destination: '釜山',
  destinationCountry: '韓國',
  passportCountryCode: 'TW',
  communityPosts: [],
  savedInspirations: [],
  onResearchEntryRules: async () => {},
  onSelectPassportCountry: () => {},
} as never;

/** What Korea actually returned: guidance, and nothing anyone must file. */
const lookedUpAndFoundNothing = {
  entry: {
    summary: '台灣旅客入境韓國短期觀光享免簽證待遇。',
    actionableItems: [],
    sources: [],
  },
  generatedAt: '2026-10-01T16:55:00.000Z',
} as never;

afterEach(cleanup);

describe('the entry-rules panel after a lookup that found nothing', () => {
  it('says so, rather than looking like it was never asked', () => {
    render(<TripPlanOverview {...baseProps} travelRules={lookedUpAndFoundNothing} />);

    expect(screen.getByTestId('entry-rules-empty').textContent).toContain('沒有查到必須事先辦理的手續');
  });

  it('demotes the call to action to 重新查詢', () => {
    render(<TripPlanOverview {...baseProps} travelRules={lookedUpAndFoundNothing} />);

    expect(screen.getByRole('button', { name: '重新查詢' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '查詢入境規定' })).toBeNull();
  });

  it('still asks on a trip nobody has looked up', () => {
    render(<TripPlanOverview {...baseProps} travelRules={undefined} />);

    expect(screen.getByRole('button', { name: '查詢入境規定' })).toBeTruthy();
    expect(screen.queryByTestId('entry-rules-empty')).toBeNull();
  });
});
