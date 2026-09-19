/**
 * @vitest-environment jsdom
 *
 * Asking for a change to a plan that is nearly right.
 *
 * Before this the only two answers to a proposal were to take it whole or
 * throw it away and ask again, which also discards the parts that were fine.
 * The sentence someone writes here — 「想在城之島多留一點時間」 — is the
 * richest signal the product gets: a dismissal says no, this says why, and it
 * says it against something specific.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityPlanCards from '../components/ActivityPlanCards';
import type { ActivityPlanProposal } from '../services/activityPlanProposal';

const plan = {
  id: 'plan-1',
  title: '三浦半島慢活海鮮景觀之旅',
  whyItFits: '距離市區近，行駛路線單純。',
  durationDays: 1,
  characteristics: [],
  logistics: {},
  budgetConfidence: 'unverified',
  items: [{ time: '09:00', title: '城之島公園漫步', type: 'ACTIVITY', dayOffset: 0 }],
  preparation: [],
} as unknown as ActivityPlanProposal;

const revised = { ...plan, title: '三浦半島慢活海鮮景觀之旅（放慢版）' };

const open = async (props: Partial<React.ComponentProps<typeof ActivityPlanCards>> = {}) => {
  const user = userEvent.setup();
  const view = render(
    <ActivityPlanCards
      options={[plan]}
      grounded
      sources={[]}
      days={[]}
      onAddToItinerary={() => {}}
      {...props}
    />,
  );
  await user.click(screen.getByText(/看這個方案/));
  return { user, view };
};

afterEach(cleanup);

describe('asking for a revision', () => {
  it('sends the traveller’s own words with the plan they are looking at', async () => {
    const onRevise = vi.fn();
    const { user } = await open({ onRevise });

    await user.type(screen.getByPlaceholderText(/想在城之島多留/), '想在城之島多留一點時間');
    await user.click(screen.getByText(/請 AI 改一版/));

    expect(onRevise).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan-1' }),
      '想在城之島多留一點時間',
    );
  });

  it('will not send an empty request', async () => {
    const onRevise = vi.fn();
    await open({ onRevise });

    await userEvent.setup().click(screen.getByText(/請 AI 改一版/));
    expect(onRevise).not.toHaveBeenCalled();
  });

  it('offers a way back once a revision has been asked for', async () => {
    // A second version being worse than the first is ordinary. Without this,
    // asking for a change is a gamble, and people stop asking.
    const onRestoreOriginal = vi.fn();
    const { user } = await open({ onRevise: () => {}, onRestoreOriginal });

    expect(screen.queryByText('回到原本那版')).toBeNull();

    await user.type(screen.getByPlaceholderText(/想在城之島多留/), '不想開車');
    await user.click(screen.getByText(/請 AI 改一版/));

    await waitFor(() => expect(screen.getByText('回到原本那版')).toBeTruthy());
    await user.click(screen.getByText('回到原本那版'));
    expect(onRestoreOriginal).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1' }));
  });

  it('shows no revision box when the screen does not offer one', async () => {
    await open({});
    expect(screen.queryByText('想改哪裡？')).toBeNull();
  });

  it('keeps the revised plan open where the original was', async () => {
    // The revised plan carries the original's id so the card the traveller is
    // reading does not close under them and send them back to the comparison.
    const { user } = await open({ onRevise: () => {} });
    expect(screen.getByText(plan.title)).toBeTruthy();

    cleanup();
    render(
      <ActivityPlanCards
        options={[{ ...revised, id: plan.id }]}
        grounded
        sources={[]}
        days={[]}
        onAddToItinerary={() => {}}
        onRevise={() => {}}
      />,
    );
    await user.click(screen.getByText(/看這個方案/));
    expect(screen.getByText(revised.title)).toBeTruthy();
  });
});
