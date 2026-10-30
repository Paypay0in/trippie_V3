/**
 * @vitest-environment jsdom
 *
 * No raw i18n key reaches the screen.
 *
 * `TIP_LABELS` in `TripPlanOverview` maps a tip's kind onto an i18n key, and
 * the render site printed the map directly. Four of the five kinds therefore
 * put the literal string 「plan.tip.payment」 in the left column of the local
 * tips table; the fifth was the hardcoded 'APP', which looked like a label and
 * is why nobody noticed the other four.
 *
 * The shape is the one this repo keeps producing: a value that is a key in one
 * place and display text in another. The test is written against what a
 * traveller sees rather than against the map, so moving the labels somewhere
 * else cannot make it pass vacuously.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import TripPlanOverview from '../components/TripPlanOverview';
import { getDestinationTips } from '../services/destinationTips';

const baseProps: Record<string, unknown> = {
  expenses: [],
  shoppingList: [],
  itinerary: [],
  companionCount: 1,
  dateRange: '2026/10/02 - 10/07',
  onContinuePlanning: () => {},
  onEnterTripMode: () => {},
  onExploreInspiration: () => {},
  onManageMembers: () => {},
  passportCountryCode: 'TW',
  communityPosts: [],
  savedInspirations: [],
  onResearchEntryRules: async () => {},
  onSelectPassportCountry: () => {},
};

const mount = (over: Record<string, unknown>) => {
  const props = Object.assign({}, baseProps, over) as unknown as React.ComponentProps<typeof TripPlanOverview>;
  render(<TripPlanOverview {...props} />);
};

afterEach(cleanup);

describe('local tips never show a key', () => {
  /*
    Korea exercises four of the five kinds in one table — app, transport and
    payment — which is where the defect was visible.
  */
  it('translates the kind label instead of printing its key', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    const shown = document.body.textContent || '';
    expect(shown).not.toContain('plan.tip.');
    expect(shown).not.toContain('plan.tips.');
    expect(shown).not.toContain('plan.power.');
  });

  it('shows the real words for the kinds Korea uses', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    const shown = document.body.textContent || '';
    expect(shown).toContain('支付');
    expect(shown).toContain('交通');
  });

  /*
    The tip bodies come from the same table and through the same `t`. A key that
    resolved to itself would read as a key on the screen too.
  */
  it('renders the tips as sentences', () => {
    mount({ destination: '釜山', destinationCountry: '韓國' });

    expect(getDestinationTips('韓國').length).toBeGreaterThan(0);
    // Twice: the tip's own heading and the App Store link under it.
    expect(screen.getAllByText(/Naver Map/).length).toBeGreaterThanOrEqual(2);
  });

  /* A country with a single tip still goes through the same path. */
  it('holds for a country with one tip', () => {
    mount({ destination: '香港', destinationCountry: '香港' });

    const shown = document.body.textContent || '';
    expect(shown).not.toContain('plan.tip.');
    expect(shown).toContain('八達通');
  });
});
