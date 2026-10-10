/**
 * @vitest-environment jsdom
 *
 * A stored trip opened from the shelf, with the stage as it was filed.
 *
 * 「剛剛有一度修好 但是又壞掉」. Opening a trip re-applies the stored ledger, and
 * that call handed the bills over exactly as filed — by category, from before
 * the date rule. So the stage was right while the app was starting and wrong
 * again the moment the trip was opened.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const DRAFT_ID = 'busan';

const bill = (id: string, description: string, date: string) => ({
  id,
  description,
  amount: 408,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 408,
  category: '美妝保養',
  paymentMethod: 'CASH_TWD',
  phase: 'post',
  date,
  payerId: 'me',
  beneficiaries: ['me'],
  splitMethod: 'EQUAL',
  splitAllocations: {},
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山', destination: '釜山',
    startDate: '2026-10-02', endDate: '2026-10-07',
    expenses: [
      bill('olive-young', 'OLIVE YOUNG 美妝保養品', '2026-10-03'),
      bill('airport', '機場免稅店', '2026-10-08'),
    ],
    companions: [], shoppingList: [], itinerary: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('重新打開行程，10/03 的帳不會跑回回國機場消費', async () => {
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
  await waitFor(() =>
    expect(document.body.textContent || '').toContain('回國機場消費'),
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
