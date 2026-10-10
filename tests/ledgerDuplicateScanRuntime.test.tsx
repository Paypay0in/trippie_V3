/**
 * @vitest-environment jsdom
 *
 * A ledger filled in before the duplicate check existed, opened again.
 *
 * 「如果你有疑問的 你把帳圈起來然後要詢問用戶是否合併」. The check runs at import, so
 * 釜山 still holds two OLIVE YOUNG at 18,000 KRW on 10/03 — one purchase counted
 * twice in the trip total and in what the other traveller owes. Nobody was ever
 * asked about them, because the asking did not exist yet.
 *
 * Asked, not applied: two separate purchases of the same price on the same day
 * are a real thing, and only the person who was there can say which this is.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const DRAFT_ID = 'busan';

const bill = (id: string, description: string, amount: number, date: string) => ({
  id,
  description,
  amount,
  currency: 'KRW',
  exchangeRate: 0.0237,
  exchangeRateDate: date,
  twdAmount: Math.round(amount * 0.0237),
  category: '美妝保養',
  paymentMethod: 'CASH_TWD',
  phase: 'during',
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
      bill('oy-1', 'OLIVE YOUNG 美妝品', 18000, '2026-10-03'),
      bill('oy-2', 'OLIVE YOUNG 美妝品', 18000, '2026-10-03'),
      bill('mug', '馬克杯', 20000, '2026-10-03'),
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

it('開啟行程時，把帳本裡同日同額的兩筆圈出來問使用者', async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));

  const prompt = await screen.findByTestId('duplicate-receipt-prompt');
  expect(prompt.textContent).toContain('有 1 組可能是同一筆');
  // The purchase that merely cost a different amount is not dragged in.
  expect(prompt.textContent).not.toContain('馬克杯');

  /*
    Nothing is ticked on a ledger sweep: KRW prices are round, so a matched
    amount is as often two purchases as one. Merging is the deliberate act.
  */
  expect(screen.getByTestId('confirm-duplicates').textContent).toContain('維持原狀');
  await user.click(screen.getByTestId('duplicate-pair-0'));
  await user.click(screen.getByTestId('confirm-duplicates'));

  await waitFor(() =>
    expect(screen.queryByTestId('duplicate-receipt-prompt')).toBeNull(),
  );

  const { readDraftStore } = await import('../services/tripPersistence');
  await waitFor(() => {
    const stored = readDraftStore().drafts.find(d => d.id === DRAFT_ID)!;
    expect(stored.expenses.map(e => e.id).sort()).toEqual(['mug', 'oy-1']);
  });
});
