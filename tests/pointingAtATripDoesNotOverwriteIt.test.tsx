/**
 * @vitest-environment jsdom
 *
 * Changing which trip is open must not write the open one into it.
 *
 * 「我的釜山不見了」. It was not. On the friend's profile I had written the
 * 「open this trip」 action as `setActiveDraftId(draft.id)` and nothing else —
 * and this app has a standing persistence effect that writes everything on
 * screen （name, destination, dates, expenses, itinerary, shopping list） into
 * whatever `activeDraftId` points at. Pointing it at 釜山 while 東京 was still
 * on screen wrote 東京 into 釜山. The shelf then had two 東京 and no 釜山.
 *
 * Found with the Founder's own data at 00:32, after six minutes of my reading
 * the symptom as a display bug. This is the test that was owed for it.
 *
 * Two halves, because one of them is not enough:
 *
 * - the runtime half proves the trip that was not opened is left exactly as it
 *   was, through the real App and the real persistence effect;
 * - the source half proves no future caller can reintroduce the bare version,
 *   which is the actual mistake. A passing runtime test for the shelf said
 *   nothing about the new screen I had just added.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { JOINED_KEY } from '../components/JoinTripSheet';

const fetchMyTrips = vi.fn();

vi.mock('../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authService')>();
  return {
    ...actual,
    getSession: vi.fn(async () => ({ user: { id: 'his-account', email: 'north@example.com' } })),
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
    // `fingerprints` is read off the result, so an empty one, not null.
    pushTripSnapshot: async () => ({ status: 'ok', data: { fingerprints: {} } }),
  };
});

const TOKYO = 'trip-tokyo';
const BUSAN = 'trip-busan';

const busan = {
  id: BUSAN,
  name: '釜山',
  destination: '釜山',
  startDate: '2026-10-02',
  endDate: '2026-10-06',
  expenses: [], companions: [], shoppingList: [],
  createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
};

const tokyo = {
  id: TOKYO,
  name: '東京',
  destination: '東京',
  startDate: '2026-10-20',
  endDate: '2026-10-24',
  expenses: [], companions: [], shoppingList: [],
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

const stored = (id: string) =>
  JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]')
    .find((draft: { id: string }) => draft.id === id);

beforeEach(() => {
  localStorage.clear();
  // 東京 is the trip on screen; 釜山 is the one sitting beside it.
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([tokyo, busan]));
  localStorage.setItem('trippie_active_trip_id', TOKYO);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
  fetchMyTrips.mockReset();
  fetchMyTrips.mockResolvedValue({ status: 'ok', data: [] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Driven through the one path the app already has for 「open this trip now」,
 * rather than through the friend's profile: that screen calls `handleOpenDraft`
 * and so does this, and what is being asserted is what the persistence effect
 * does afterwards. The screen-by-screen half of the guard is the source check
 * below, because the mistake was a new caller, not a broken `hydrateDraft`.
 */
describe('opening another trip', () => {
  it('leaves that trip exactly as it was', async () => {
    localStorage.setItem(JOINED_KEY, BUSAN);
    const { default: App } = await import('../App');
    render(<App />);

    await waitFor(() => expect(localStorage.getItem('trippie_active_trip_id')).toBe(BUSAN));

    /*
      The assertion the bug would have failed: 釜山 is still 釜山.

      Not 「the right trip is open」 — that part was never broken. What broke was
      the contents of the trip being pointed at.
    */
    await waitFor(() => {
      expect(stored(BUSAN)).toMatchObject({
        name: '釜山',
        destination: '釜山',
        startDate: '2026-10-02',
        endDate: '2026-10-06',
      });
    });

    // And 東京 did not acquire 釜山's anything on the way past.
    expect(stored(TOKYO)).toMatchObject({ name: '東京', startDate: '2026-10-20' });
  });
});

/**
 * The guard against writing it again.
 *
 * `hydrateDraft` loads a trip and then points at it; creating a trip sets the
 * hydration flag because the screen state is being replaced in the same
 * breath. Any other call that moves the pointer without one of those is the
 * bug, whichever screen it is written on.
 */
describe('every setActiveDraftId that names a trip', () => {
  it('loads that trip in the same breath', () => {
    const source = readFileSync(resolve(process.cwd(), 'App.tsx'), 'utf8').split('\n');

    const bare = source.flatMap((line, index) => {
      const match = /setActiveDraftId\(([^)]*)\)/.exec(line);
      // Clearing the pointer writes nowhere, so it needs nothing.
      if (!match || match[1].trim() === 'null') return [];
      // A few lines of room: the flag is set just above, as both callers do.
      const context = source.slice(Math.max(0, index - 5), index + 1).join('\n');
      if (/isHydratingTripRef\.current = true/.test(context)) return [];
      return [`App.tsx:${index + 1}  ${line.trim()}`];
    });

    expect(bare, 'use hydrateDraft (or set isHydratingTripRef) — pointing at a trip without loading it overwrites it').toEqual([]);
  });
});
