/**
 * @vitest-environment jsdom
 *
 * Accepting an invite has to end somewhere.
 *
 * It ended in a reload. The membership was written and the trip appeared in the
 * bookshelf, and the traveller was returned to whatever she had open before —
 * which, on the trip this was found on, was her own empty 釜山 sitting beside
 * the shared 釜山 she had just been let into. Same name, same cover, nothing on
 * screen saying anything had happened. Three days of 「完全不同步」 were one
 * untaken step: nobody opened the trip.
 *
 * Proven against the database afterwards: her account was a member of the
 * shared trip the whole time, which held 23 itinerary items and 2 expenses,
 * while the trip she was looking at held nothing at all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { JOINED_KEY } from '../components/JoinTripSheet';
import * as tripSync from '../services/tripSync';

const fetchMyTrips = vi.fn();

vi.mock('../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authService')>();
  return {
    ...actual,
    getSession: vi.fn(async () => ({ user: { id: 'her-account', email: 'gina@example.com' } })),
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

const OWN_TRIP = 'her-own-busan';
const SHARED_TRIP = 'shared-busan';

/** Her device before the join: one trip of her own, open, and empty. */
const seedHerDevice = () => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: OWN_TRIP,
    name: '釜山',
    destination: '釜山',
    startDate: '2026-10-02',
    endDate: '2026-10-07',
    expenses: [], companions: [], shoppingList: [], itinerary: [],
    createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', OWN_TRIP);
};

beforeEach(() => {
  seedHerDevice();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
  // The cloud answers with both trips: hers, and the one she has just joined.
  fetchMyTrips.mockReset();
  fetchMyTrips.mockResolvedValue({
    status: 'ok',
    data: [
      { id: OWN_TRIP, name: '釜山', startDate: '2026-10-02', endDate: '2026-10-07' },
      { id: SHARED_TRIP, name: '釜山', startDate: '2026-10-02', endDate: '2026-10-07' },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mountSignedIn = async () => {
  const { default: App } = await import('../App');
  render(<App />);
  return userEvent.setup();
};

describe('after accepting an invite', () => {
  it('opens the trip that was joined, and says so', async () => {
    // What the claim left behind on its way into the reload.
    localStorage.setItem(JOINED_KEY, SHARED_TRIP);

    await mountSignedIn();

    // The trip she joined becomes the trip she is in.
    await waitFor(() => expect(localStorage.getItem('trippie_active_trip_id')).toBe(SHARED_TRIP));
    // And the marker is not left to fire a second time on the next load.
    expect(localStorage.getItem(JOINED_KEY)).toBeNull();
  });

  it('leaves the open trip alone when nothing was joined', async () => {
    await mountSignedIn();

    // The cloud merge still runs; it just must not move anyone.
    await waitFor(() => expect(fetchMyTrips).toHaveBeenCalled());
    expect(localStorage.getItem('trippie_active_trip_id')).toBe(OWN_TRIP);
  });

  it('waits rather than losing the marker when the trip has not arrived yet', async () => {
    localStorage.setItem(JOINED_KEY, 'a-trip-this-account-cannot-see');

    await mountSignedIn();

    await waitFor(() => expect(fetchMyTrips).toHaveBeenCalled());
    expect(localStorage.getItem('trippie_active_trip_id')).toBe(OWN_TRIP);
    // Kept, so a later load can still act on it.
    expect(localStorage.getItem(JOINED_KEY)).toBe('a-trip-this-account-cannot-see');
  });
});
