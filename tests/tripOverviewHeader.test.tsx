/**
 * @vitest-environment jsdom
 *
 * 「將總覽改成這樣」 — the overview opens on the place, with the ways out under
 * it.
 *
 * A tile is omitted rather than disabled when the caller has nowhere to send
 * it. A control that leads nowhere is the fourth kind of dead tap this screen
 * has produced tonight, and the cheapest one to never ship.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripLiveOverview from '../components/TripLiveOverview';

const weather = {
  temperature: 24, condition: '多雲', high: 29, low: 19, precipitationProbability: 8,
  tomorrow: { high: 29, low: 19, precipitationProbability: 55, condition: '陣雨' },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('/api/weather') ? weather : {}),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const show = (over: Record<string, unknown> = {}) => render(
  <TripLiveOverview
    expenses={[]}
    itinerary={[]}
    startDate="2026-10-20"
    endDate="2026-10-24"
    destination="Tokyo"
    onQuickAdd={vi.fn()}
    onOpenPlanning={vi.fn()}
    onOpenRecords={vi.fn()}
    {...over}
  />,
);

/**
 * 「為何出現兩個」 — because I drew a second one.
 *
 * `TripWorkspaceShell` has drawn the destination, the dates and 旅行中 above
 * this screen since before it existed. Adding the same card here made the
 * overview open on two of them, one saying Tokyo and one saying 日本.
 *
 * Two places drawing one fact is the defect this codebase keeps producing,
 * and the fix is always to delete the second rather than reconcile it.
 */
describe('the overview header', () => {
  it('does not draw a second one', () => {
    show();

    expect(screen.queryByTestId('trip-hero')).toBeNull();
  });
});

describe('the ways out', () => {
  it('always offers the plan', () => {
    show();

    expect(screen.getByTestId('trip-way-行程規劃')).toBeTruthy();
  });

  it('offers a companion list when there is one to open', () => {
    const onOpenCompanions = vi.fn();
    show({ onOpenCompanions });

    fireEvent.click(screen.getByTestId('trip-way-旅伴'));

    expect(onOpenCompanions).toHaveBeenCalled();
  });

  it('offers all five when every door is wired', () => {
    show({
      onOpenMap: vi.fn(),
      onOpenShoppingList: vi.fn(),
      onOpenCompanions: vi.fn(),
      onOpenMore: vi.fn(),
    });

    ['行程規劃', '地圖', '購物清單', '旅伴', '更多'].forEach(label => {
      expect(screen.getByTestId(`trip-way-${label}`)).toBeTruthy();
    });
  });

  /* The rule this screen has earned the hard way. */
  it('leaves out the tiles with nowhere to go', () => {
    show();

    expect(screen.queryByTestId('trip-way-旅伴')).toBeNull();
    expect(screen.queryByTestId('trip-way-地圖')).toBeNull();
    expect(screen.queryByTestId('trip-way-購物清單')).toBeNull();
  });
});

/**
 * 旅程回顧 — and the only photographs this trip holds are the traveller's own,
 * taken of their own bills. Filling the strip with Google's pictures of the
 * same places would be captioning somebody else's photos as their trip.
 */
describe('旅程回顧', () => {
  const billWithPhoto = (id: string, date: string, photo: string) => ({
    id, date, description: id, twdAmount: 100, amount: 100, currency: 'TWD',
    exchangeRate: 1, category: '餐飲', phase: 'during', receiptPhotos: [photo],
  }) as never;

  it('shows the photos, newest first', () => {
    show({
      expenses: [
        billWithPhoto('old', '2026-10-20', 'older'),
        billWithPhoto('new', '2026-10-21', 'newest'),
      ],
    });

    const shots = screen.getByTestId('trip-memories').querySelectorAll('img');
    expect(Array.from(shots).map(node => node.getAttribute('src'))).toEqual(['newest', 'older']);
  });

  /* Nothing photographed is nothing to look back on. */
  it('is absent when the trip has no photos', () => {
    show({ expenses: [] });

    expect(screen.queryByTestId('trip-memories')).toBeNull();
  });
});


/**
 * 「少一個明天衣著建議！」 — under the weather card, derived from the forecast
 * printed above it.
 */
describe('明天穿什麼', () => {
  it('reads tomorrow and says what to wear', async () => {
    show({ destinationCoordinates: { latitude: 35.68, longitude: 139.76 } });

    await waitFor(() => expect(screen.getByTestId('what-to-wear')).toBeTruthy());
    const block = screen.getByTestId('what-to-wear');
    expect(block.textContent).toContain('明天 29° / 19°・陣雨');
    expect(block.textContent).toContain('帶把傘');
  });

  /* A forecast nobody returned is not a forecast. */
  it('says nothing when the provider gave no second day', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('/api/weather')
        ? { ...weather, tomorrow: undefined }
        : {}),
    })));
    show({ destinationCoordinates: { latitude: 35.68, longitude: 139.76 } });

    await waitFor(() => expect(screen.getByTestId('trip-quick-ways')).toBeTruthy());
    expect(screen.queryByTestId('what-to-wear')).toBeNull();
  });
});
