/**
 * @vitest-environment jsdom
 *
 * 「2 人」 has to lead somewhere.
 *
 * The member count sat in the quick overview as a figure with no way to ask
 * who — on a trip where one of the two had silently lost her seat four times,
 * and the only screen that could have said so was two menus away.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  destination: '釜山',
  communityPosts: [],
  savedInspirations: [],
  travelRules: undefined,
} as never;

afterEach(() => cleanup());

describe('the 旅行成員 tile', () => {
  it('opens the traveller list when tapped', async () => {
    const onManageMembers = vi.fn();
    const user = userEvent.setup();
    render(<TripPlanOverview {...baseProps} onManageMembers={onManageMembers} />);

    await user.click(screen.getByRole('button', { name: '查看旅行成員' }));

    expect(onManageMembers).toHaveBeenCalledTimes(1);
  });

  it('counts the owner alongside the companions', () => {
    render(<TripPlanOverview {...baseProps} onManageMembers={() => {}} />);

    expect(screen.getByText('2 人')).toBeTruthy();
  });

  it('stays a plain figure when there is nowhere to go', () => {
    render(<TripPlanOverview {...baseProps} />);

    expect(screen.queryByRole('button', { name: '查看旅行成員' })).toBeNull();
    expect(screen.getByText('2 人')).toBeTruthy();
  });
});
