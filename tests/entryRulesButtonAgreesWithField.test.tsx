/**
 * @vitest-environment jsdom
 *
 * 「為何不能點」.
 *
 * The 目的地 field read 墨西哥 and 查詢入境規定 was greyed out beside it. The
 * field falls back to the trip's destination text when the country was never
 * resolved; the button was gated on the resolved country alone. So the screen
 * displayed a destination and refused to act on the one it was displaying,
 * with no way to tell from the outside which of the two was lying.
 *
 * The handler was never the stricter one — `handleResearchTravelRules` sends
 * the trip's own destination text. The gate was guarding against something
 * that was not a problem.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

const baseProps: Record<string, unknown> = {
  expenses: [],
  shoppingList: [],
  itinerary: [],
  companionCount: 1,
  dateRange: '2026/11/03 - 11/08',
  onContinuePlanning: () => {},
  onEnterTripMode: () => {},
  onExploreInspiration: () => {},
  onManageMembers: () => {},
  communityPosts: [],
  savedInspirations: [],
  onResearchEntryRules: async () => {},
  onSelectPassportCountry: () => {},
  onChangeDestination: () => {},
  passportCountryCode: 'TW',
  hasPassport: true,
};

const mount = (over: Record<string, unknown>) => {
  const props = Object.assign({}, baseProps, over) as unknown as React.ComponentProps<typeof TripPlanOverview>;
  render(<TripPlanOverview {...props} />);
};

afterEach(cleanup);

describe('查詢入境規定', () => {
  /* The case from the screenshot: a destination typed, no country resolved. */
  it('can be pressed when the field shows a destination', () => {
    mount({ destination: '墨西哥', destinationCountry: '' });

    expect((screen.getByTestId('entry-rules-destination') as HTMLInputElement).value).toBe('墨西哥');
    expect(screen.getByTestId('entry-rules-lookup').hasAttribute('disabled')).toBe(false);
  });

  it('runs the lookup', async () => {
    const onResearchEntryRules = vi.fn().mockResolvedValue(undefined);
    mount({ destination: '墨西哥', destinationCountry: '', onResearchEntryRules });

    fireEvent.click(screen.getByTestId('entry-rules-lookup'));

    expect(onResearchEntryRules).toHaveBeenCalled();
  });

  /* Says what it will use, rather than which internal field held it. */
  it('names the destination it will search with', () => {
    mount({ destination: '墨西哥', destinationCountry: '' });

    expect(screen.getByText('查詢會用「墨西哥」')).toBeTruthy();
  });

  it('is still refused when there is no destination at all', () => {
    mount({ destination: '', destinationCountry: '' });

    expect(screen.getByTestId('entry-rules-lookup').hasAttribute('disabled')).toBe(true);
  });

  /* A passport is a real requirement: the rules are about that passport. */
  it('is still refused without a passport', () => {
    mount({ destination: '墨西哥', destinationCountry: '墨西哥', hasPassport: false });

    expect(screen.getByTestId('entry-rules-lookup').hasAttribute('disabled')).toBe(true);
  });
});
