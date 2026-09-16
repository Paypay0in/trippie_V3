/**
 * @vitest-environment jsdom
 *
 * An expense recorded from 記帳 ＞ 旅行中 must land in 旅行中, whatever the
 * overview's stage is. The trip here departs weeks from now, so the overview
 * says 旅行前 — which is exactly the case that put 機票/簽證/保險 on screen
 * while the traveller was standing in the ledger's 旅行中 tab.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen } from '@testing-library/react';

const DRAFT_ID = 'draft-stage';
// Far enough ahead that the overview is unambiguously 行前.
const START = '2099-10-22';
const END = '2099-10-31';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '東京測試行程', destination: '東京',
    startDate: START, endDate: END,
    expenses: [], companions: [], shoppingList: [], itinerary: [],
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

const settle = async () => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
};

it('records from 記帳 ＞ 旅行中 into 旅行中', async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await settle();

  await user.click(screen.getByText('記帳'));
  await settle();
  await user.click(screen.getByText('旅行中'));
  await settle();

  await user.click(screen.getByLabelText('新增記錄'));
  await settle();

  const expenseEntry = screen.queryByText('新增支出');
  if (expenseEntry) {
    await user.click(expenseEntry);
    await settle();
  }

  expect(screen.getByText('記入旅行中')).toBeTruthy();
  // The categories follow the stage, which is what made the wrong stage visible.
  expect(screen.getByText('餐飲')).toBeTruthy();
  expect(screen.queryByText('簽證')).toBeNull();
});
