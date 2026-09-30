/**
 * @vitest-environment jsdom
 *
 * The only sync indicator was a development-mode banner, so in production a
 * working trip and a silently failing one looked identical — which is the
 * state a laptop and a phone on the same account were in, with nothing on
 * either screen to say why they disagreed.
 */
import React from 'react';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloudSyncStatus from '../components/CloudSyncStatus';
import * as tripSync from '../services/tripSync';

beforeEach(() => cleanup());
afterEach(() => vi.restoreAllMocks());

describe('cloud sync status', () => {
  it('says plainly that a signed-out device shares nothing', () => {
    vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
    render(<CloudSyncStatus signedIn={false} localTripCount={3} />);

    expect(screen.getByText(/未登入/)).toBeTruthy();
    // No point offering a check that cannot succeed.
    expect(screen.queryByRole('button', { name: /檢查雲端連線/ })).toBeNull();
  });

  it('reports both counts, because only the pair answers the question', () => {
    vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
    vi.spyOn(tripSync, 'fetchMyTrips').mockResolvedValue({
      status: 'ok',
      data: [{ id: 'a', name: 'A', startDate: '', endDate: '' }, { id: 'b', name: 'B', startDate: '', endDate: '' }],
    });

    return (async () => {
      const user = userEvent.setup();
      render(<CloudSyncStatus signedIn email="north@example.com" localTripCount={2} />);
      await user.click(screen.getByRole('button', { name: /檢查雲端連線/ }));

      expect(await screen.findByText(/連線正常/)).toBeTruthy();
      expect(screen.getByText(/雲端 2 趟 · 本機 2 趟/)).toBeTruthy();
    })();
  });

  it('explains a mismatch instead of leaving the traveller to guess', async () => {
    vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
    vi.spyOn(tripSync, 'fetchMyTrips').mockResolvedValue({
      status: 'ok',
      data: [{ id: 'a', name: 'A', startDate: '', endDate: '' }],
    });

    const user = userEvent.setup();
    render(<CloudSyncStatus signedIn email="north@example.com" localTripCount={4} />);
    await user.click(screen.getByRole('button', { name: /檢查雲端連線/ }));

    expect(await screen.findByText(/本機比雲端多/)).toBeTruthy();
  });

  it("shows the provider's own words on failure", async () => {
    vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
    vi.spyOn(tripSync, 'fetchMyTrips').mockResolvedValue({
      status: 'error',
      message: 'JWT expired',
    });

    const user = userEvent.setup();
    render(<CloudSyncStatus signedIn email="north@example.com" localTripCount={1} />);
    await user.click(screen.getByRole('button', { name: /檢查雲端連線/ }));

    expect(await screen.findByText(/連線失敗/)).toBeTruthy();
    // A paraphrase loses the one detail that identifies which cause this is.
    expect(screen.getByText('JWT expired')).toBeTruthy();
  });

  it('says so when the build has no cloud at all', () => {
    vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(false);
    render(<CloudSyncStatus signedIn localTripCount={1} />);
    expect(screen.getByText(/沒有連上雲端/)).toBeTruthy();
  });
});
