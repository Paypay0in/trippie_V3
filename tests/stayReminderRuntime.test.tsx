/**
 * @vitest-environment jsdom
 *
 * 「入住與退房 不是一個行程 是一個提醒事項」, and the 「時間序不對」 it caused.
 *
 * As timeline cards they took a slot in the day, sat between two real stops,
 * and made the journey either side uncomputable — so a day read as though the
 * traveller had travelled to their own hotel room at eleven in the morning.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ItineraryItem } from '../types';
import ItineraryCalendar from '../components/ItineraryCalendar';

vi.mock('../services/placePhotoService', () => ({ fetchPlacePhoto: () => Promise.resolve(null) }));
vi.mock('../services/placeCommerceService', () => ({
  fetchPlaceCommerce: () => Promise.resolve(null),
  hasDisplayableCommerce: () => false,
}));
vi.mock('../services/routesService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  estimateRoute: () => Promise.resolve(null),
  fetchRouteLeg: () => Promise.resolve(null),
}));

afterEach(cleanup);

const DAY = '2026-10-07';

const checkOut: ItineraryItem = {
  id: 'stay-out', title: '退房 Kent Hotel Gwangalli', location: 'Kent Hotel Gwangalli',
  notes: '', type: 'HOTEL', fixedEventKind: 'accommodation', date: DAY, time: '11:00',
  latitude: 35.1535, longitude: 129.1183,
} as ItineraryItem;

const stop = (id: string, time: string): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: DAY, time,
  durationMinutes: 90, latitude: 35.1615, longitude: 129.1622,
} as ItineraryItem);

const renderDay = (items: ItineraryItem[]) =>
  render(<ItineraryCalendar items={items} startDate={DAY} endDate={DAY} />);

describe('check-in and check-out', () => {
  it('are not cards in the day', () => {
    renderDay([stop('HELMET', '09:00'), checkOut, stop('午餐', '13:00')]);

    expect(document.querySelector('[data-item-id="stay-out"]')).toBeNull();
  });

  it('are shown as a reminder, with the time that matters', () => {
    renderDay([stop('HELMET', '09:00'), checkOut]);

    const reminder = screen.getByTestId('stay-reminder-stay-out');

    expect(reminder.textContent).toContain('退房');
    expect(reminder.textContent).toContain('11:00');
  });

  it('leave the real stops consecutive', () => {
    // 「時間序不對」: the hotel sat between two places, so the journey either
    // side was drawn against a room instead of against the next stop.
    renderDay([stop('HELMET', '09:00'), checkOut, stop('午餐', '13:00')]);

    expect(screen.queryByTestId('transport-unavailable-stay-out')).toBeNull();
    expect(screen.getByTestId('transport-leg')).toBeTruthy();
  });

  it('do not become the day first stop', () => {
    // The morning leg is hotel → first place. If check-out were a card, it
    // would be the first place, and the leg would go from the hotel to itself.
    renderDay([checkOut, stop('HELMET', '13:00')]);

    expect(screen.queryByTestId('morning-leg-stay-out')).toBeNull();
    expect(screen.queryByTestId('morning-leg-unavailable-stay-out')).toBeNull();
  });

  it('show no reminder row on a day with no check-in or check-out', () => {
    renderDay([stop('HELMET', '09:00')]);

    expect(screen.queryByTestId('stay-reminders')).toBeNull();
  });
});
