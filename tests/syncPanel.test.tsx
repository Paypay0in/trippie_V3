/**
 * @vitest-environment jsdom
 *
 * 「都沒有同步到彼此手機」 cannot be diagnosed from two screens that both report
 * 正常. `?sync=1` forces the sync panel on and makes it state the facts that
 * actually differ between two devices: which trip, which account, and what the
 * last read and write carried.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useTripSync } from '../hooks/useTripSync';
import * as tripSync from '../services/tripSync';

const TRIP_ID = 'trip-abcdef01-2345';
const USER_ID = 'user-9876543210';

const Harness: React.FC = () => {
  useTripSync({
    tripId: TRIP_ID,
    authUserId: USER_ID,
    tripName: '釜山',
    viewerMemberId: `${TRIP_ID}:owner`,
    members: [],
    expenses: [],
    itinerary: [],
    flightAnchors: [],
    onRemoteSnapshot: () => undefined,
  });
  return null;
};

const panelText = () => document.getElementById('trippie-sync-badge')?.textContent || '';

const setSearch = (search: string) => {
  window.history.replaceState({}, '', `/${search}`);
};

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
  setSearch('');
  vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
  vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } });
  vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({
    status: 'ok',
    data: {
      members: [{ id: 'm-1' } as never, { id: 'm-2' } as never],
      expenses: [{ id: 'e-1' } as never],
      itinerary: [{ id: 'i-1' } as never, { id: 'i-2' } as never, { id: 'i-3' } as never],
      flightAnchors: [],
    },
  } as never);
});

afterEach(() => {
  cleanup();
  document.getElementById('trippie-sync-badge')?.remove();
  vi.restoreAllMocks();
});

describe('sync panel', () => {
  it('stays hidden on a healthy trip when it was not asked for', async () => {
    render(<Harness />);
    await waitFor(() => expect(panelText()).toBe(''));
  });

  it('?sync=1 shows the trip, the account and what the last read carried', async () => {
    setSearch('?sync=1');
    render(<Harness />);

    await waitFor(() => expect(panelText()).toContain('雲端同步'));
    // The trip and the account are what differ between two phones that both
    // look fine, so they must be on screen before anything else.
    expect(panelText()).toContain('旅程 trip-abc…');
    expect(panelText()).toContain('帳號 user-987…');
    // Who this device thinks is using it. 「其他 888」 stayed in the owner's
    // ledger on a build whose filter was provably right against the same data,
    // and this id — everything's input — had never been on screen.
    expect(panelText()).toContain(`身分 ${TRIP_ID}:owner`);
    await waitFor(() => expect(panelText()).toContain('成員2・帳1・行程3・航班0'));
  });

  it('survives the navigation it takes to reach the screen in question', async () => {
    setSearch('?sync=1');
    render(<Harness />);
    await waitFor(() => expect(panelText()).toContain('雲端同步'));

    // The query string is gone the moment the app navigates.
    cleanup();
    document.getElementById('trippie-sync-badge')?.remove();
    setSearch('');
    render(<Harness />);
    await waitFor(() => expect(panelText()).toContain('旅程 trip-abc…'));
  });

  it('?sync=0 turns it back off', async () => {
    setSearch('?sync=1');
    render(<Harness />);
    await waitFor(() => expect(panelText()).toContain('雲端同步'));

    cleanup();
    document.getElementById('trippie-sync-badge')?.remove();
    setSearch('?sync=0');
    render(<Harness />);
    await waitFor(() => expect(panelText()).toBe(''));
  });
});
