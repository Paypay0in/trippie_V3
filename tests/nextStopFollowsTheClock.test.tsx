/**
 * @vitest-environment jsdom
 *
 * 「現在是晚上十點半 他沒有跟著本機時間在判斷下一站」.
 *
 * The selection rule is unit-tested next to the service. This is the part that
 * actually failed him: whether the card on screen reads the clock at all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripLiveOverview from '../components/TripLiveOverview';
import { ItineraryItem } from '../types';

const DAY_ONE = '2026-10-02';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '09:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: DAY_ONE, ...over,
});

/** His day 1, nothing ticked — 0/6 項已完成. */
const itinerary = [
  item({ id: 'to-airport', time: '14:35', title: '抵達機場', location: '台灣桃園國際機場' }),
  item({ id: 'landing', time: '19:55', title: '航班抵達', location: '金海國際機場' }),
  item({ id: 'gamcheon', date: '2026-10-03', time: '10:00', title: '甘川洞文化村' }),
];

const card = () => render(
  <TripLiveOverview
    expenses={[]}
    itinerary={itinerary}
    startDate={DAY_ONE}
    endDate="2026-10-07"
    onQuickAdd={vi.fn()}
    onOpenPlanning={vi.fn()}
    onOpenRecords={vi.fn()}
    destination="釜山"
  />,
);

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('下一站跟著本機時間', () => {
  it('晚上十點半不會再指向下午 14:35 的桃園機場', () => {
    vi.setSystemTime(new Date(`${DAY_ONE}T22:37:00`));
    card();

    expect(document.body.textContent).not.toContain('台灣桃園國際機場');
  });

  it('改成指向明天的第一站，而且標出那是明天', () => {
    vi.setSystemTime(new Date(`${DAY_ONE}T22:37:00`));
    card();

    expect(screen.getByText('甘川洞文化村')).toBeTruthy();
    expect(screen.getByText('明天')).toBeTruthy();
  });

  it('早上八點看到的還是當天第一站', () => {
    vi.setSystemTime(new Date(`${DAY_ONE}T08:00:00`));
    card();

    expect(screen.getByText('抵達機場')).toBeTruthy();
  });

  it('正在進行的項目標成「現在」，和上面的旅程狀態區分開', () => {
    vi.setSystemTime(new Date(`${DAY_ONE}T14:40:00`));
    card();

    expect(screen.getByText('抵達機場')).toBeTruthy();
    expect(screen.getByText('現在')).toBeTruthy();
  });
});
