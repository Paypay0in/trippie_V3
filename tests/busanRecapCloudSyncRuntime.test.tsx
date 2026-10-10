/**
 * @vitest-environment jsdom
 *
 * 釜山 as it actually is: 共用・2 人, hydrated from the cloud on every open.
 *
 * 「我怎麼點還是看 他一直在回國 根本沒有改變」. Every test so far had the cloud
 * switched off, so `onRemoteSnapshot` — the handler that puts the stored stage
 * back — never ran. The local path was proved over and over while the path this
 * trip actually takes went untested.
 *
 * This renders the real App with a real snapshot arriving, and reads the recap.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as tripSync from '../services/tripSync';
import * as authService from '../services/authService';

const DRAFT_ID = 'busan';
const START = '2026-10-02';
const END = '2026-10-07';

const bill = (id: string, description: string, date: string) => ({
  id,
  description,
  amount: 408,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 408,
  category: '美妝保養',
  paymentMethod: 'CASH_TWD',
  // What the cloud row carries: the stage guessed from the category.
  phase: 'post',
  date,
  payerId: 'me',
  beneficiaries: ['me'],
  splitMethod: 'EQUAL',
  splitAllocations: {},
});

beforeEach(() => {
  localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山', destination: '釜山',
    startDate: START, endDate: END,
    expenses: [], companions: [], shoppingList: [], itinerary: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);

  // Sync only runs for a signed-in traveller — 釜山 is 共用・2 人, and without
  // this the snapshot never arrives and the assertions below prove nothing.
  vi.spyOn(authService, 'getSession').mockResolvedValue({
    user: { id: 'north', email: 'north@example.com', user_metadata: {} },
  } as never);
  vi.spyOn(authService, 'fetchProfile').mockResolvedValue({
    userId: 'north', displayName: 'North',
  } as never);
  vi.spyOn(authService, 'subscribeToAuthChanges').mockReturnValue({
    data: { subscription: { unsubscribe: () => {} } },
  } as never);
  vi.spyOn(tripSync, 'isSyncAvailable').mockReturnValue(true);
  vi.spyOn(tripSync, 'ensureTripRow').mockResolvedValue({ status: 'ok', data: { created: false } } as never);
  vi.spyOn(tripSync, 'pushTripSnapshot').mockResolvedValue({ status: 'ok', data: null } as never);
  vi.spyOn(tripSync, 'fetchTripSnapshot').mockResolvedValue({
    status: 'ok',
    data: {
      members: [],
      expenses: [
        bill('olive-young', 'OLIVE YOUNG 美妝保養品', '2026-10-03'),
        bill('airport', '機場免稅店', '2026-10-08'),
      ],
      itinerary: [],
      flightAnchors: [],
    },
  } as never);

  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  document.getElementById('trippie-sync-badge')?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('雲端同步的行程，RECAP 不會把 10/03 的帳放在回國機場消費', async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  /*
    A finished trip opens in the workspace now, on its overview. The ledger is
    where it always was — behind 記帳 — and reaching it is the point: the screen
    this replaced had no nav at all.
  */
  await user.click(await screen.findByText('記帳'));
  // The ledger opens on 旅行前; 回國機場消費 is the 返程 tab.
  await user.click(await screen.findByText('返程'));

  // Wait for the cloud copy to land, not just for the trip to open: the whole
  // point is what the screen says *after* the snapshot has been applied.
  await waitFor(() =>
    expect(document.body.textContent || '').toContain('機場免稅店'),
  );

  // In the ledger the recap tab is 結算.
  await user.click(await screen.findByText('結算'));
  await waitFor(() =>
    expect(document.body.textContent || '').toContain('回國機場消費'),
  );

  const recap = document.body.textContent || '';
  expect(recap).toContain('機場免稅店');
  expect(recap).not.toContain('OLIVE YOUNG');
});
