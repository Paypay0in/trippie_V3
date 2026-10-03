/**
 * @vitest-environment jsdom
 *
 * 「目前行程也要點擊後讓用戶看到小卡 另外，地址要可以一鍵複製」.
 *
 * The address was printed on the card in grey 10px text and nothing else: a
 * traveller standing on a street in Busan had to select it by hand, or retype
 * it into another app. Tapping the place now opens the same card the collection
 * uses — map, directions, and one tap to copy the address.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ItineraryItem } from '../types';
import ItineraryCalendar from '../components/ItineraryCalendar';

vi.mock('../services/placePhotoService', () => ({ fetchPlacePhoto: () => Promise.resolve(null) }));
vi.mock('../services/placeCommerceService', () => ({
  fetchPlaceCommerce: () => Promise.resolve(null),
  hasDisplayableCommerce: () => false,
}));
vi.mock('../services/routesService', () => ({ estimateRoute: () => Promise.resolve(null) }));

afterEach(cleanup);

const DAY = '2026-10-04';

const items: ItineraryItem[] = [{
  id: 'it-spa',
  date: DAY,
  time: '18:00',
  durationMinutes: 180,
  title: 'SPA LAND Centum City',
  location: 'SPA LAND Centum City',
  address: '35 Centum nam-daero, Haeundae, Busan',
  placeId: 'g-spa',
  latitude: 35.1689,
  longitude: 129.1300,
  notes: '',
  type: 'ACTIVITY',
  savedTravelNotes: [{
    id: 'n1', sourceNoteId: 'sn-1', sourceSliceId: 'screenshot:a', sourcePostId: 'screenshot:a',
    sourceCreatorId: 'user-1', type: 'timing', text: '建議預留 3 小時以上',
  }],
}];

const renderCalendar = (itinerary: ItineraryItem[] = items) =>
  render(<ItineraryCalendar items={itinerary} startDate={DAY} endDate={DAY} />);

describe('opening a place on the plan', () => {
  it('opens the card when the place is tapped', async () => {
    const user = userEvent.setup();
    renderCalendar();

    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));

    expect(screen.getByTestId('saved-place-card')).toBeTruthy();
  });

  it('offers the address for copying in one tap', async () => {
    const user = userEvent.setup();
    // After setup: userEvent installs its own clipboard stub over this one.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderCalendar();

    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));
    await user.click(screen.getByTestId('saved-place-copy'));

    expect(writeText).toHaveBeenCalledWith('35 Centum nam-daero, Haeundae, Busan');
    expect(screen.getByText('已複製')).toBeTruthy();
  });

  it('links to the exact place, not a name search', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));

    const url = new URL(screen.getByTestId('saved-place-maps-link').getAttribute('href') || '');
    expect(url.searchParams.get('query_place_id')).toBe('g-spa');
  });

  it('navigates to the point', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));

    const url = new URL(screen.getByTestId('saved-place-directions-link').getAttribute('href') || '');
    expect(url.searchParams.get('destination')).toBe('35.1689,129.13');
  });

  it('carries the notes the plan already holds', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));

    expect(within(screen.getByTestId('saved-place-card')).getByText('建議預留 3 小時以上')).toBeTruthy();
  });

  it('warns when the item was never linked to a map place', async () => {
    const user = userEvent.setup();
    renderCalendar([{
      ...items[0], placeId: undefined, address: undefined, latitude: undefined, longitude: undefined,
    }]);

    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));

    expect(screen.getByText(/還沒對到地圖上的地點/)).toBeTruthy();
  });

  it('closes again', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByTestId('open-itinerary-place-it-spa'));
    await user.click(screen.getByLabelText('關閉'));

    expect(screen.queryByTestId('saved-place-card')).toBeNull();
  });
});
