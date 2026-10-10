/**
 * @vitest-environment jsdom
 *
 * 釜山 10/02–10/07, opened from the shelf, with the bills as they were stored.
 *
 * 「這些歸帳」「要按照日期」. Everything up to here was tested a layer at a time —
 * the date rule, the read path, the cloud hydrate — and the screen still showed
 * OLIVE YOUNG bought on 10/03 under 回國機場消費. This opens the trip the way the
 * traveller does and reads the stage off the recap itself.
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const DRAFT_ID = 'busan';
const START = '2026-10-02';
const END = '2026-10-07';

const bill = (id: string, description: string, date: string, phase: string) => ({
  id,
  description,
  amount: 408,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 408,
  category: '美妝保養',
  paymentMethod: 'CASH_TWD',
  // As stored: the stage guessed from the category at import time.
  phase,
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
    startDate: START, endDate: END,
    expenses: [
      bill('olive-young', 'OLIVE YOUNG 美妝保養品', '2026-10-03', 'post'),
      bill('airport', '機場免稅店', '2026-10-08', 'post'),
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

it('10/03 買的不再掛在回國機場消費，10/08 買的還在', async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  // A trip whose dates have passed opens on 返程中, which is the screen the
  // 回國機場消費 list lives on — the one the stage was wrong on.
  await waitFor(() =>
    expect(document.body.textContent || '').toContain('回國機場消費'),
  );

  const { readDraftStore } = await import('../services/tripPersistence');
  const stored = readDraftStore().drafts.find(d => d.id === DRAFT_ID)!;
  const stageOf = (id: string) => stored.expenses.find(e => e.id === id)?.phase;

  expect(stageOf('olive-young')).toBe('during');
  expect(stageOf('airport')).toBe('post');

  // And on the recap itself, which is the screen 「最後recap 裡還是放在回國機場
  // 消費」 was reported against — a different component from the 返程中 list.
  await user.click(screen.getByText('回顧紀錄'));
  await waitFor(() =>
    expect(document.body.textContent || '').toContain('回國機場消費'),
  );

  const recap = document.body.textContent || '';
  expect(recap).toContain('機場免稅店');
  expect(recap).not.toContain('OLIVE YOUNG');
});
