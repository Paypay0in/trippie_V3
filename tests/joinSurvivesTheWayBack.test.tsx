/**
 * @vitest-environment jsdom
 *
 * 「我用這個連結分享給 sherry 但她登入沒看到東京的旅冊」.
 *
 * Four separate ways the join could fail and look like it had not. Each one
 * left her on a screen that said nothing was wrong, which is why the only
 * symptom reaching the Founder was 「沒看到」.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import JoinTripSheet, { JOINED_KEY } from '../components/JoinTripSheet';
import { DELETED_TRIPS_STORAGE_KEY, deletedTripIds } from '../services/deletedTrips';
import { claimFailureMessage } from '../services/inviteFailure';

const previewInvite = vi.fn();
const claimInvite = vi.fn();

vi.mock('../services/tripInvites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/tripInvites')>();
  return {
    ...actual,
    previewInvite: (...args: unknown[]) => previewInvite(...args),
    claimInvite: (...args: unknown[]) => claimInvite(...args),
  };
});

vi.mock('../services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/authService')>();
  return {
    ...actual,
    getSession: vi.fn(async () => ({ user: { id: 'sherry' } })),
    subscribeToAuthChanges: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  };
});

const TOKEN = 'e324f258a3ea42b98a32c07cac512f5e';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  previewInvite.mockReset();
  claimInvite.mockReset();
  window.history.replaceState({}, '', `/?join=${TOKEN}`);
  // The reload at the end of a successful claim is not interesting here.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: vi.fn(), search: `?join=${TOKEN}` },
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('opening an invite link', () => {
  /*
    A used invite is still tried. `claim_trip_invite` is idempotent for a
    caller who already holds a seat — it hands back the trip id and writes
    nothing. Refusing to call it meant somebody whose first claim worked, but
    whose trip never appeared, could reopen the link forever and only ever
    read 「這個邀請已經被使用過了」.
  */
  it('still claims an invite that has already been claimed', async () => {
    previewInvite.mockResolvedValue({
      status: 'ok', data: { tripName: '東京', memberName: 'Sherry', alreadyClaimed: true },
    });
    claimInvite.mockResolvedValue({ status: 'ok', data: 'trip-tokyo' });

    render(<JoinTripSheet />);

    await waitFor(() => expect(claimInvite).toHaveBeenCalledWith(TOKEN));
    await waitFor(() => expect(localStorage.getItem(JOINED_KEY)).toBe('trip-tokyo'));
  });

  /*
    Joining is asking for the trip, which outranks having deleted it. A
    tombstoned id is dropped by the cloud merge, so the claim succeeded and
    merged into nothing — silently, on every reload.
  */
  it('forgets that this device once deleted the trip', async () => {
    localStorage.setItem(DELETED_TRIPS_STORAGE_KEY, JSON.stringify(['trip-tokyo']));
    previewInvite.mockResolvedValue({
      status: 'ok', data: { tripName: '東京', memberName: 'Sherry', alreadyClaimed: false },
    });
    claimInvite.mockResolvedValue({ status: 'ok', data: 'trip-tokyo' });

    render(<JoinTripSheet />);

    await waitFor(() => expect(deletedTripIds()).not.toContain('trip-tokyo'));
  });

  /*
    A failed preview used to change no state at all, so the sheet said
    正在確認邀請… forever while the claim ran blind behind it.
  */
  it('says so when the invite cannot even be checked', async () => {
    previewInvite.mockResolvedValue({ status: 'error', message: 'network down' });
    claimInvite.mockResolvedValue({ status: 'ok', data: 'trip-tokyo' });

    render(<JoinTripSheet />);

    await waitFor(() => expect(screen.getByText(/確認邀請失敗：network down/)).toBeTruthy());
  });
});

/**
 * The likeliest real failure, and it reached her as raw English inside a
 * Chinese sentence, describing something nobody calls a seat.
 */
describe('claimFailureMessage', () => {
  it('explains a seat somebody else is already in', () => {
    const said = claimFailureMessage('this seat has already been taken');
    expect(said).toContain('位子已經被別的帳號使用');
    expect(said).not.toContain('seat');
  });

  it('still passes through anything it has never seen', () => {
    expect(claimFailureMessage('something new')).toContain('something new');
  });
});
