/**
 * @vitest-environment jsdom
 *
 * 「已經經過的日期 要變成灰色的」.
 *
 * On the fourth day of the trip the first two tabs looked exactly like the days
 * still ahead, so the part of the trip that is still a decision could not be
 * told from the part that is now a record.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import type { ItineraryItem } from '../types';
import ItineraryCalendar from '../components/ItineraryCalendar';

vi.mock('../services/placePhotoService', () => ({ fetchPlacePhoto: () => Promise.resolve(null) }));
vi.mock('../services/placeCommerceService', () => ({
  fetchPlaceCommerce: () => Promise.resolve(null),
  hasDisplayableCommerce: () => false,
}));
vi.mock('../services/routesService', () => ({ estimateRoute: () => Promise.resolve(null) }));

afterEach(cleanup);

/** Dates relative to the real clock: a fixture of fixed days stops testing this. */
const isoDay = (offset: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const YESTERDAY = isoDay(-1);
const TODAY = isoDay(0);
const TOMORROW = isoDay(1);

const items: ItineraryItem[] = [
  { id: 'it-past', date: YESTERDAY, time: '10:00', title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY' },
  { id: 'it-today', date: TODAY, time: '10:00', title: '海雲台', location: '海雲台', notes: '', type: 'ACTIVITY' },
];

const renderCalendar = () =>
  render(<ItineraryCalendar items={items} startDate={isoDay(-2)} endDate={TOMORROW} />);

describe('the day tabs', () => {
  it('marks the days that have already passed', () => {
    renderCalendar();

    expect(screen.getByTestId(`day-tab-${YESTERDAY}`).getAttribute('data-past')).toBe('true');
    expect(screen.getByTestId(`day-tab-${isoDay(-2)}`).getAttribute('data-past')).toBe('true');
  });

  it('leaves today and the days ahead alone', () => {
    // Today is not over, and the evening of it is still a decision.
    renderCalendar();

    expect(screen.getByTestId(`day-tab-${TODAY}`).getAttribute('data-past')).toBeNull();
    expect(screen.getByTestId(`day-tab-${TOMORROW}`).getAttribute('data-past')).toBeNull();
  });

  it('greys a past day visually', () => {
    renderCalendar();

    expect(screen.getByTestId(`day-tab-${YESTERDAY}`).className).toContain('opacity-60');
    expect(screen.getByTestId(`day-tab-${TOMORROW}`).className).not.toContain('opacity-60');
  });

  it('still opens a past day', async () => {
    // The plan for a day gone is where its notes and its spending are read back.
    const user = userEvent.setup();
    renderCalendar();

    await user.click(screen.getByTestId(`day-tab-${YESTERDAY}`));

    expect(screen.getAllByText('甘川文化村').length).toBeGreaterThan(0);
  });
});

/**
 * 「比方說今日已經 day 3 打開行程表的時候 預設就不要再從 day1 開始」.
 *
 * Opening on the first day is right exactly once — before the trip starts. On
 * the third morning it is two taps before the screen says anything about
 * today, every time the app is opened.
 */
describe('the day the itinerary opens on', () => {
  it('is today, when the trip is running', () => {
    render(<ItineraryCalendar items={items} startDate={isoDay(-2)} endDate={TOMORROW} />);

    expect(screen.getByTestId(`day-tab-${TODAY}`).className).toContain('bg-[#f4f1ff]');
  });

  it('is not the first day', () => {
    render(<ItineraryCalendar items={items} startDate={isoDay(-2)} endDate={TOMORROW} />);

    expect(screen.getByTestId(`day-tab-${isoDay(-2)}`).className).not.toContain('bg-[#f4f1ff]');
  });

  it('is the first day before the trip starts', () => {
    // Nothing has happened yet, and the first day is the one being planned.
    render(<ItineraryCalendar items={[]} startDate={isoDay(10)} endDate={isoDay(13)} />);

    expect(screen.getByTestId(`day-tab-${isoDay(10)}`).className).toContain('bg-[#f4f1ff]');
  });

  it('is the last day once the trip is over', () => {
    render(<ItineraryCalendar items={[]} startDate={isoDay(-10)} endDate={isoDay(-7)} />);

    expect(screen.getByTestId(`day-tab-${isoDay(-7)}`).className).toContain('bg-[#f4f1ff]');
  });

  it('still follows the day the traveller taps', async () => {
    const user = userEvent.setup();
    render(<ItineraryCalendar items={items} startDate={isoDay(-2)} endDate={TOMORROW} />);

    await user.click(screen.getByTestId(`day-tab-${YESTERDAY}`));

    expect(screen.getByTestId(`day-tab-${YESTERDAY}`).className).toContain('bg-[#f4f1ff]');
    expect(screen.getByTestId(`day-tab-${TODAY}`).className).not.toContain('bg-[#f4f1ff]');
  });
});
