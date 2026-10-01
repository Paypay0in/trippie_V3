/**
 * @vitest-environment jsdom
 *
 * 「我朋友看到的結算根本不正確…他要付錢給我才對」.
 *
 * Her settlement read 「應向 Gina 收取 NT$ 16,000」 — the right sum, owed by the
 * wrong person to the wrong person, because her phone had her down as the owner
 * of his 釜山.
 *
 * Reading `owner_id` back from the server fixed trips arriving from then on and
 * did nothing for the one already sitting on her phone: the merge only ever
 * added what was absent. A trip pulled down before the column was asked for
 * kept the owner it had been given locally — whoever pulled it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const fetchMyTrips = vi.fn();

vi.mock('../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authService')>();
  return {
    ...actual,
    getSession: vi.fn(async () => ({ user: { id: HER_ACCOUNT, email: 'gina@example.com' } })),
    subscribeToAuthChanges: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  };
});

vi.mock('../services/tripSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/tripSync')>();
  return {
    ...actual,
    isSyncAvailable: () => true,
    fetchMyTrips: (...args: unknown[]) => fetchMyTrips(...args),
    ensureTripRow: async () => ({ status: 'ok', data: { created: false } }),
    fetchTripSnapshot: async () => ({ status: 'ok', data: { members: [], expenses: [], itinerary: [], flightAnchors: [] } }),
    pushTripSnapshot: async () => ({ status: 'ok', data: null }),
  };
});

const SHARED = 'muo3ht39hl3hpfed';
const HIS_ACCOUNT = '8b4c29bc-b53b-4b3f-89bb-d0efb0cc8871';
const HER_ACCOUNT = '113e8451-1484-446b-8c4c-71fe8cd7601c';

const readDrafts = (): Array<{ id: string; ownerId?: string }> =>
  JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');

beforeEach(() => {
  localStorage.clear();
  // His trip, as her phone stored it before the server was asked who owned it.
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: SHARED,
    ownerId: HER_ACCOUNT,
    name: '釜山',
    destination: '釜山',
    startDate: '2026-10-02',
    endDate: '2026-10-07',
    expenses: [], companions: [], shoppingList: [], itinerary: [],
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', SHARED);

  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));

  fetchMyTrips.mockReset();
  fetchMyTrips.mockResolvedValue({
    status: 'ok',
    data: [{ id: SHARED, name: '釜山', startDate: '2026-10-02', endDate: '2026-10-07', ownerId: HIS_ACCOUNT }],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a trip already on the device', () => {
  it('has its owner corrected from the server, not only new arrivals', async () => {
    const { default: App } = await import('../App');
    render(<App />);

    await waitFor(() => expect(fetchMyTrips).toHaveBeenCalled());
    await waitFor(() => {
      expect(readDrafts().find(draft => draft.id === SHARED)?.ownerId).toBe(HIS_ACCOUNT);
    });
  });
});
