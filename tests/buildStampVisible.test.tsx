/**
 * @vitest-environment jsdom
 *
 * 「我應該要怎麼可以確定有是新版的」
 *
 * There was no answer. Both travellers were told to look for a heading that the
 * commit under test had in fact deleted, so the check could never pass, and four
 * rounds of a two-device failure were spent arguing about whose phone was stale.
 *
 * The build is therefore stated on the panel, above every other number — all of
 * which mean nothing until both devices are known to run the same code.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useTripSync } from '../hooks/useTripSync';
import { BUILD_ID } from '../services/buildStamp';
import * as tripSync from '../services/tripSync';

const Harness: React.FC = () => {
  useTripSync({
    tripId: 'trip-abcdef01-2345',
    authUserId: 'user-9876543210',
    tripName: '釜山',
    members: [],
    expenses: [],
    itinerary: [],
    flightAnchors: [],
    onRemoteSnapshot: () => undefined,
  });
  return null;
};

const panelText = () => document.getElementById('trippie-sync-badge')?.textContent || '';

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
  vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } } as never);
  vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({
    status: 'ok',
    data: { members: [], expenses: [], itinerary: [], flightAnchors: [] },
  } as never);
});

afterEach(() => {
  cleanup();
  document.getElementById('trippie-sync-badge')?.remove();
  vi.restoreAllMocks();
});

describe('which build this device is running', () => {
  it('is on the panel, so two phones can be compared rather than guessed at', async () => {
    window.history.replaceState({}, '', '/?sync=1');
    render(<Harness />);

    await waitFor(() => expect(panelText()).toContain('雲端同步'));
    expect(panelText()).toContain(`版本 ${BUILD_ID}`);
  });

  it('is a real stamp rather than an empty line', () => {
    expect(BUILD_ID).toBeTruthy();
    expect(BUILD_ID).not.toContain('undefined');
  });
});
