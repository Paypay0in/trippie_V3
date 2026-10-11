/**
 * @vitest-environment jsdom
 *
 * 「目前旅程都已經完成了」.
 *
 * 釜山 ran 2026/10/02–10/07. On 10/10 the workspace header said RETURN 返程中
 * while the home screen called the same trip 已結束的旅程. One trip saying two
 * things on two screens is worse than either being wrong: after that neither
 * can be trusted, and the traveller has no way to tell which one is lying.
 *
 * So this file is about agreement, not about either label being pretty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import TravelHome from '../components/TravelHome';
import { phaseForDate } from '../services/tripPhaseByDate';
import { TripDraft } from '../services/tripPersistence';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const busan = {
  id: 'busan', ownerId: 'north', name: '釜山', destination: '釜山',
  startDate: '2026-10-02', endDate: '2026-10-07',
  expenses: [], companions: [], shoppingList: [],
  createdAt: '2026-09-01', updatedAt: '2026-10-07',
} as unknown as TripDraft;

const onToday = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
  render(
    <TravelHome
      activeSection="trips"
      onSectionChange={vi.fn()}
      onPlus={vi.fn()}
      drafts={[busan]}
      tripHistory={[]}
      activeDraftId="busan"
      onContinueDraft={vi.fn()}
      onContinueTrip={vi.fn()}
      onCreateNew={vi.fn()}
      onOpenPlanner={vi.fn()}
      savedTravelInspirations={[]}
      communityPosts={[]}
      onOpenSavedDestination={vi.fn()}
      authStatus="anonymous"
    />,
  );
};

describe('a trip three days after it ended', () => {
  /** The exact report. */
  it('is not still returning', () => {
    expect(phaseForDate('2026-10-10', busan.startDate, busan.endDate)).not.toBe('post');
  });

  it('is called 已結束的旅程 on the home screen', () => {
    onToday('2026-10-10');
    expect(screen.getByText('已結束的旅程')).toBeTruthy();
  });

  /**
   * The agreement itself: the home card's three states and the workspace's
   * four now come from one function, so they cannot drift apart again.
   */
  it('agrees with the phase the workspace shows', () => {
    const phase = phaseForDate('2026-10-10', busan.startDate, busan.endDate);
    onToday('2026-10-10');
    const finished = phase === 'post' || phase === 'summary';
    expect(finished).toBe(true);
    expect(screen.getByText('已結束的旅程')).toBeTruthy();
  });

  it('still calls the last day of the trip 進行中', () => {
    onToday('2026-10-07');
    expect(screen.getByText('進行中的旅程')).toBeTruthy();
    expect(phaseForDate('2026-10-07', busan.startDate, busan.endDate)).toBe('during');
  });

  it('still calls a trip that has not started 即將出發', () => {
    onToday('2026-09-20');
    expect(screen.getByText('即將出發')).toBeTruthy();
    expect(phaseForDate('2026-09-20', busan.startDate, busan.endDate)).toBe('pre');
  });
});
