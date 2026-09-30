/**
 * @vitest-environment jsdom
 *
 * Getting from the invite to a sign-in form.
 *
 * The sheet told the friend to sign in and gave her nothing to press — the
 * only button was 稍後再說. It cannot navigate on its own: it is mounted
 * beside App, so it has no access to the navigation state, which is exactly
 * how that gap opened. It asks by event instead.
 *
 * This is a runtime test because the failure it guards is invisible to types:
 * a button that dispatches an event nobody listens for renders identically to
 * one that works.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import JoinTripSheet, { OPEN_SIGN_IN_EVENT, clearPendingInvite } from '../components/JoinTripSheet';

vi.mock('../services/authService', () => ({
  // Signed out, which is the state the friend arrives in.
  getSession: () => Promise.resolve(null),
  subscribeToAuthChanges: () => ({ unsubscribe: () => {} }),
}));

vi.mock('../services/tripInvites', async () => {
  const actual = await vi.importActual<typeof import('../services/tripInvites')>('../services/tripInvites');
  return {
    ...actual,
    previewInvite: () => Promise.resolve({
      status: 'ok' as const,
      data: { tripName: '釜山', memberName: 'Gina', alreadyClaimed: false },
    }),
    claimInvite: () => Promise.resolve({ status: 'ok' as const, data: 'trip-1' }),
  };
});

afterEach(() => {
  cleanup();
  clearPendingInvite(window.sessionStorage);
  window.history.replaceState({}, '', '/');
});

const open = () => {
  window.history.replaceState({}, '', '/?join=tok123456789012345');
  render(<JoinTripSheet />);
};

describe('the invite sheet, signed out', () => {
  it('offers a way to sign in, not just a way to leave', async () => {
    open();
    await screen.findByText(/一起去/);

    expect(screen.getByRole('button', { name: /登入/ })).toBeTruthy();
  });

  it('asks the app to open sign-in when it is pressed', async () => {
    const heard = vi.fn();
    window.addEventListener(OPEN_SIGN_IN_EVENT, heard);
    open();
    await screen.findByText(/一起去/);

    await userEvent.click(screen.getByRole('button', { name: /登入/ }));

    expect(heard).toHaveBeenCalled();
    window.removeEventListener(OPEN_SIGN_IN_EVENT, heard);
  });

  it('gets out of the way, because it would cover the sign-in form', async () => {
    open();
    await screen.findByText(/一起去/);

    await userEvent.click(screen.getByRole('button', { name: /登入/ }));

    await waitFor(() => expect(screen.queryByText(/一起去/)).toBeNull());
  });

  it('keeps the invite while it is out of the way', async () => {
    open();
    await screen.findByText(/一起去/);

    await userEvent.click(screen.getByRole('button', { name: /登入/ }));

    // Stepping aside must not be dismissing: the token has to survive for the
    // claim to fire once she has an account.
    await waitFor(() => expect(screen.queryByText(/一起去/)).toBeNull());
    expect(window.sessionStorage.getItem('trippie_pending_invite')).toBe('tok123456789012345');
  });
});
