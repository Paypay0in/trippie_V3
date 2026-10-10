/**
 * @vitest-environment jsdom
 *
 * 「我按下去確認入帳 沒有反應」.
 *
 * A refund already in the ledger stops a second one being written, which is
 * right — but the guard asked whether any bill named 退稅入帳 sat in the 返程
 * stage, and a 0 KRW placeholder recorded earlier answers yes. The modal then
 * closed having written nothing, so the only thing the traveller could see was
 * their own entry disappearing.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const DRAFT_ID = 'busan';

const refundPlaceholder = {
  id: 'refund-0',
  description: '退稅入帳 (Tax Refund)',
  amount: 0,
  currency: 'KRW',
  exchangeRate: 0.0237,
  twdAmount: 0,
  category: '其他',
  paymentMethod: 'CREDIT_CARD',
  phase: 'post',
  date: '2026-10-03',
  payerId: 'me',
  beneficiaries: ['me'],
  splitMethod: 'EQUAL',
  splitAllocations: {},
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山', destination: '釜山',
    startDate: '2026-10-02', endDate: '2026-10-07',
    expenses: [refundPlaceholder],
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

it('帳本裡已有退稅紀錄時，要說得出為什麼，而不是默默關掉', async () => {
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

  // 10/03 falls inside 10/02–10/07, so the existing refund is filed 旅行中 —
  // the stage a guard keyed on 返程 would have stopped recognising it by.
  const { readDraftStore } = await import('../services/tripPersistence');
  const stored = readDraftStore().drafts.find(d => d.id === DRAFT_ID)!;
  const existing = stored.expenses.find(e => e.description === '退稅入帳 (Tax Refund)')!;
  expect(existing.phase).toBe('during');

  const { findDuplicateRefund } = await import('../services/refundSettlement');
  // Found by what it is, so it is still recognised from any stage.
  expect(findDuplicateRefund(stored.expenses)?.id).toBe('refund-0');
  expect(findDuplicateRefund([])).toBeUndefined();
});
