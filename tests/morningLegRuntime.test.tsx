/**
 * @vitest-environment jsdom
 *
 * 「每天第一個行程要記得由旅館到第一個行程的交通要顯示在行程表」.
 *
 * The timeline drew a journey between every pair of stops and nothing before
 * the first one — so the one leg a traveller plans their morning around was
 * the only one missing.
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

const IN = '2026-10-03';
const DAY = '2026-10-04';
const OUT = '2026-10-05';

const hotel = (title: string, date: string, located = true): ItineraryItem => ({
  id: `stay-${date}`, title, location: 'Lavender Hotel', notes: '', type: 'HOTEL',
  fixedEventKind: 'accommodation', date, time: title.startsWith('入住') ? '15:00' : '11:00',
  ...(located ? { latitude: 35.1535, longitude: 129.1183, placeId: 'g-hotel' } : {}),
} as ItineraryItem);

const stop = (id: string, time: string, date = DAY, located = true): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date, time, durationMinutes: 60,
  ...(located ? { latitude: 35.1615, longitude: 129.1622 } : {}),
} as ItineraryItem);

const STAY = [hotel('入住 Lavender Hotel', IN), hotel('退房 Lavender Hotel', OUT)];

const renderDay = (items: ItineraryItem[], startDate = DAY, endDate = DAY) =>
  render(<ItineraryCalendar items={items} startDate={startDate} endDate={endDate} />);

describe('the morning leg', () => {
  it('shows how to get from the hotel to the first stop', () => {
    renderDay([...STAY, stop('市場', '09:00'), stop('咖啡', '13:00')]);

    expect(screen.getByTestId('morning-leg-市場')).toBeTruthy();
    expect(screen.getByTestId('morning-leg-市場').textContent).toContain('從 Lavender Hotel 出發');
  });

  it('draws it only once, before the first stop', () => {
    renderDay([...STAY, stop('市場', '09:00'), stop('咖啡', '13:00')]);

    expect(screen.queryByTestId('morning-leg-咖啡')).toBeNull();
  });

  it('still draws it on the morning they check out', () => {
    // They have no room that night, but they unmistakably start the day there.
    render(<ItineraryCalendar items={[...STAY, stop('機場免稅店', '09:00', OUT)]} startDate={OUT} endDate={OUT} />);

    expect(screen.getByTestId('morning-leg-機場免稅店')).toBeTruthy();
  });

  it('draws nothing on the day they arrive', () => {
    // That journey is the airport transfer, and it has its own card.
    render(<ItineraryCalendar items={[...STAY, stop('海雲台', '17:00', IN)]} startDate={IN} endDate={IN} />);

    expect(screen.queryByTestId('morning-leg-海雲台')).toBeNull();
  });

  it('says why when the hotel has no map link', () => {
    const unlocated = [hotel('入住 Lavender Hotel', IN, false), hotel('退房 Lavender Hotel', OUT, false)];
    renderDay([...unlocated, stop('市場', '09:00')]);

    expect(screen.getByTestId('morning-leg-unavailable-市場').textContent).toContain('還沒連結地圖');
  });

  it('says why when the first stop has no map link', () => {
    renderDay([...STAY, stop('某個地方', '09:00', DAY, false)]);

    expect(screen.getByTestId('morning-leg-unavailable-某個地方').textContent).toContain('第一個行程還沒連結地圖');
  });

  it('draws nothing when the trip has no stay at all', () => {
    renderDay([stop('市場', '09:00')]);

    expect(screen.queryByTestId('morning-leg-市場')).toBeNull();
    expect(screen.queryByTestId('morning-leg-unavailable-市場')).toBeNull();
  });
});
