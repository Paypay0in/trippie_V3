/**
 * @vitest-environment jsdom
 *
 * 「沒有下方的功能列」「我點進去這個帳本他會跳進去」.
 *
 * Opening a trip replaces the app's own navigation with the workspace's —
 * 總覽／規劃／記帳／更多 — and on some screens neither appears. The traveller is
 * left on 行程規劃 with a back arrow and no way to reach the ledger, which is
 * what they opened the trip for.
 *
 * The nav lives in exactly one place (TripWorkspaceShell), so this asks the
 * only question that matters: is it on screen, in each stage of the trip?
 */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const DRAFT_ID = 'busan';

const seed = (startDate: string, endDate: string) => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山', destination: '釜山',
    startDate, endDate,
    expenses: [], companions: [], shoppingList: [], itinerary: [],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openTrip = async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  return user;
};

/** The workspace nav, which is the only way out of a trip screen. */
const navIsOnScreen = () => {
  const body = document.body.textContent || '';
  return body.includes('總覽') && body.includes('記帳');
};

it('行程還沒開始（PLAN）時，下方導覽列在畫面上', async () => {
  seed('2099-10-02', '2099-10-07');
  await openTrip();
  await waitFor(() => expect(navIsOnScreen()).toBe(true));
});

it('行程已結束（RETURN／RECAP）時，下方導覽列也要在', async () => {
  // 10/02–10/07 against a clock already past it: the state the Busan trip is in.
  seed('2026-10-02', '2026-10-07');
  await openTrip();
  await waitFor(() => expect(navIsOnScreen()).toBe(true));
});

/**
 * 「總覽為何是空白的」.
 *
 * The overview was written for a trip that is coming or happening. A finished
 * trip never reached this screen until it was brought here for the navigation,
 * and then landed on a page with nothing on it — a worse answer than the one it
 * replaced. What a finished trip is an overview of is what it cost.
 */
it('已結束行程的總覽不是空白的', async () => {
  seed('2026-10-02', '2026-10-07');
  await openTrip();
  await waitFor(() =>
    expect(document.body.textContent || '').toContain('旅行結算報告'),
  );
});
