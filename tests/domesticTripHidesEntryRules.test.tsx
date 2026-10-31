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

/** 「已完成 N 項」 + 「還有 M 項…」, read back as done/total. */
const readiness = () => {
  const done = Number(screen.getByText(/^已完成 \d+ 項$/).textContent!.match(/\d+/)![0]);
  const open = Number(screen.getByText(/^還有 \d+ 項/).textContent!.match(/\d+/)![0]);
  return `${done}/${done + open}`;
};

/** A pre-trip task the traveller wrote, and one the entry-rules lookup added. */
const ownTask = {
  id: 'own-1',
  name: '買行動電源',
  isPurchased: false,
  phase: 'pre',
};
const ruleTask = (id: string, isPurchased = false) => ({
  id,
  name: `入境手續 ${id}`,
  isPurchased,
  phase: 'pre',
  sourceType: 'travel_rules',
});

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
});

/*
  Founder V-8 B, and the half of it that is easy to get wrong.

  An earlier version of this file asserted the readiness fraction was
  IDENTICAL whether the rules were shown or hidden. That was true only
  because its fixture had no entry-rule items in it — a test that passes for
  a reason unrelated to the rule it claims to protect. It is rewritten here
  to assert the exclusion itself.
*/
describe('domestic readiness excludes the cross-border items it hides', () => {
  it('drops travel-rule items from BOTH ends of the fraction', () => {
    show({
      tripScope: 'international',
      destination: '日本',
      shoppingList: [ownTask, ruleTask('r1', true), ruleTask('r2')],
    });
    expect(readiness()).toBe('1/3');
    cleanup();

    show({
      tripScope: 'domestic',
      shoppingList: [ownTask, ruleTask('r1', true), ruleTask('r2')],
    });
    /*
      Not 1/1. The completed rule item leaves the numerator with its own
      denominator — counting it would report 1/1 「done」 on a trip with one
      thing still to do.
    */
    expect(readiness()).toBe('0/1');
  });

  /* The items are hidden from the count, never removed from the data. */
  it('brings the items back when the trip becomes international again', () => {
    const list = [ownTask, ruleTask('r1', true), ruleTask('r2')];

    show({ tripScope: 'domestic', shoppingList: list });
    expect(readiness()).toBe('0/1');
    cleanup();

    show({ tripScope: 'international', destination: '日本', shoppingList: list });
    expect(readiness()).toBe('1/3');
    expect(list).toHaveLength(3);
  });
});
