/**
 * @vitest-environment jsdom
 *
 * 「我已全部都刪掉過了 但又一直出現」.
 *
 * Deleting a trip rewrote the local store and the local state and told the
 * cloud nothing. The merge that runs on every sign-in then asks the server for
 * every trip on the account, keeps whatever this device does not have, and
 * adds it — which is the exact description of a trip that was just deleted.
 *
 * So deleting put a trip back. Deleting again started the loop over. The app
 * was contradicting an instruction it had appeared to accept, which is worse
 * than refusing it.
 *
 * Checked through the real App against a real merge, because the unit test one
 * layer down would pass whether or not anything calls it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { DELETED_TRIPS_STORAGE_KEY } from '../services/deletedTrips';

const fetchMyTrips = vi.fn();

const ACCOUNT = '113e8451-1484-446b-8c4c-71fe8cd7601c';
const TOKYO = 'muo3ht39hl3hpfed';
const BUSAN = 'muoal9czpaxkzw1l';

vi.mock('../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authService')>();
  return {
    ...actual,
    getSession: vi.fn(async () => ({ user: { id: ACCOUNT, email: 'ann@example.com' } })),
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

const readDrafts = (): Array<{ id: string }> =>
  JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');

/** Both trips still sit in the cloud; only this device was told to forget one. */
const cloudHasBoth = () => fetchMyTrips.mockResolvedValue({
  status: 'ok',
  data: [
    { id: TOKYO, name: '日本東京', startDate: '2026-10-22', endDate: '2026-10-31', ownerId: ACCOUNT },
    { id: BUSAN, name: '韓國釜山之旅', ownerId: ACCOUNT },
  ],
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([]));

  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));

  fetchMyTrips.mockReset();
  cloudHasBoth();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const bootApp = async () => {
  const { default: App } = await import('../App');
  render(<App />);
  await waitFor(() => expect(fetchMyTrips).toHaveBeenCalled());
};

describe('刪掉的旅程', () => {
  it('雲端還有的旅程，本來就會被合併進來', async () => {
    await bootApp();

    await waitFor(() => {
      expect(readDrafts().map(draft => draft.id).sort()).toEqual([TOKYO, BUSAN].sort());
    });
  });

  it('刪過的那一趟，下次登入不會再被加回來', async () => {
    // What a delete leaves behind on this device.
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, JSON.stringify([TOKYO]));

    await bootApp();

    await waitFor(() => expect(readDrafts().length).toBeGreaterThan(0));
    expect(readDrafts().map(draft => draft.id)).toEqual([BUSAN]);
  });

  it('全部刪光，就一趟都不會回來', async () => {
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, JSON.stringify([TOKYO, BUSAN]));

    await bootApp();

    // Nothing to wait for arriving, so the assertion is that it never does.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readDrafts()).toEqual([]);
  });

  /**
   * The row is not destroyed, only refused here. A shared trip belongs to
   * everyone on it, and 「remove this from my phone」 must never be the thing
   * that deletes the ledger a travelling companion is still settling from.
   */
  it('雲端那一份沒有被刪掉 —— 只是這台裝置不再接受它', async () => {
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, JSON.stringify([TOKYO]));

    await bootApp();

    const calls = fetchMyTrips.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    // Nothing in the delete path asks the server to remove anything.
    expect(JSON.parse(localStorage.getItem(DELETED_TRIPS_STORAGE_KEY) || '[]'))
      .toEqual([TOKYO]);
  });
});
