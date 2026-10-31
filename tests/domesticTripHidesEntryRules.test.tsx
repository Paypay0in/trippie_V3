/**
 * @vitest-environment jsdom
 *
 * 國內旅行 does not ask for a visa, and the completion rate does not move.
 *
 * Two requirements in one place, because they are one requirement:
 * 「不顯示跨境簽證與入境規定檢查」 and 「不得將隱藏的跨境事項計入準備完成率」. A
 * screen that hides six items and keeps counting them reports 4/10 on a trip
 * with four things to do, and the traveller is told they are behind on work
 * that does not exist.
 *
 * The third case is the one that matters most and is easiest to get wrong: a
 * trip nobody has classified is NOT domestic. An unresolved scope keeps the
 * rules on screen, because hiding a border requirement on a guess is
 * discovered at the border.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripPlanOverview from '../components/TripPlanOverview';

const noop = () => {};

const show = (props: Record<string, unknown> = {}) =>
  render(
    <TripPlanOverview
      {...(({
        expenses: [],
        shoppingList: [],
        itinerary: [],
        savedInspirations: [],
        communityPosts: [],
        promptQuestions: [],
        flightAnchors: [],
        stays: [],
        companionCount: 1,
        dateRange: '2026/05/10 - 2026/05/12',
        destination: '台南',
        onContinuePlanning: noop,
        onEnterTripMode: noop,
        onManageMembers: noop,
        onExploreInspiration: noop,
        onAddPreparationItems: noop,
        onTogglePreparationItem: noop,
        onToggleTicketBought: noop,
        onResearchEntryRules: vi.fn(),
        onOpenIdentity: noop,
        onChangeDestination: noop,
        hasPassport: true,
        passportLabel: '台灣護照',
        ...props,
      }) as unknown as React.ComponentProps<typeof TripPlanOverview>)}
    />,
  );

afterEach(cleanup);

const readinessText = () => screen.getByText(/\d+\s*\/\s*\d+/).textContent;

describe('the preparation page by trip scope', () => {
  it('hides the entry-rules block on a domestic trip', () => {
    show({ tripScope: 'domestic' });

    expect(screen.queryByText('入境規定')).toBeNull();
  });

  it('keeps the entry-rules block on an international trip', () => {
    show({ tripScope: 'international', destination: '日本' });

    expect(screen.getByText('入境規定')).toBeTruthy();
  });

  /* An unresolved trip is not a domestic one. */
  it('keeps the entry-rules block when nobody resolved the scope', () => {
    show({ tripScope: undefined, destination: '日本' });

    expect(screen.getByText('入境規定')).toBeTruthy();
  });

  /*
    The readiness denominator counts shopping pre-tasks and ticket to-dos and
    has never counted entry rules. This asserts it STAYS that way: the number
    is identical with the block shown and hidden, so nothing hidden is counted.
  */
  it('reports the same readiness whether or not the rules are shown', () => {
    show({ tripScope: 'international', destination: '日本' });
    const abroad = readinessText();
    cleanup();

    show({ tripScope: 'domestic', destination: '台南' });
    expect(readinessText()).toBe(abroad);
  });
});
