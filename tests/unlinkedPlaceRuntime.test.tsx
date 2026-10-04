/**
 * @vitest-environment jsdom
 *
 * An itinerary card that no map knows must say so.
 *
 * 「廣安里海景早午餐咖啡廳」 is a description, not a business. Accepted, it sat
 * in the plan with no address, no photo and no hours — indistinguishable from
 * a real place whose photo simply had not loaded, two days before the trip.
 * The repair already existed inside the edit sheet; nothing on the plan said it
 * was needed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ItineraryItem } from '../types';

/*
  Dated from the clock, not written down.

  The itinerary opens on today when the trip is running — 「今日已經 day 3 打開行
  程表的時候 預設就不要再從 day1 開始」 — so a fixture with fixed dates stops
  exercising the screen it is about the moment the real date passes it.
*/
const isoDay = (offset: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const DAY_1 = isoDay(0);
const DAY_2 = isoDay(1);
const DRAFT_ID = 'draft-unlinked';

const itinerary: ItineraryItem[] = [
  // A description the AI produced: no placeId, so no map identity.
  { id: 'it-cafe', date: DAY_1, time: '08:30', title: '廣安里海景早午餐咖啡廳', location: '廣安里海景早午餐咖啡廳', notes: '', type: 'FOOD' },
  // A real place, resolved: this one must not be accused of anything.
  { id: 'it-spa', date: DAY_1, time: '14:00', title: '汗蒸幕', location: '태종대온천찜질방', address: '808 Taejong-ro, Yeongdo-gu, Busan', placeId: 'place-spa', latitude: 35.05, longitude: 129.08, notes: '', type: 'ACTIVITY' },
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
    startDate: DAY_1, endDate: DAY_2,
    expenses: [], companions: [], shoppingList: [], itinerary,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mountApp = async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
  await waitFor(() => expect(screen.getByLabelText('行程時間軸')).toBeTruthy());
  return user;
};

describe('an itinerary item with no map place', () => {
  it('is flagged, and a resolved place beside it is not', async () => {
    await mountApp();

    expect(screen.getByTestId('unlinked-place-it-cafe')).toBeTruthy();
    expect(screen.getByText('地圖上沒有這個地點，沒有地址與照片')).toBeTruthy();
    expect(screen.queryByTestId('unlinked-place-it-spa')).toBeNull();
  });

  it('offers the repair that already exists, on the card itself', async () => {
    const user = await mountApp();

    await user.click(screen.getByRole('button', { name: '連結地點' }));

    // The edit sheet, open on that item, with its own prompt to link a place.
    await waitFor(() => expect(screen.getByText('尚未連結地圖地點')).toBeTruthy());
  });
});
