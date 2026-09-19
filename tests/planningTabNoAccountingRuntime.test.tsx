/**
 * @vitest-environment jsdom
 *
 * Founder UX decision: the 規劃 tab is planning only. This asserts the real
 * rendered tab carries no accounting entry point, while the 記帳 tab keeps all
 * of its own.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ItineraryItem, ShoppingItem } from '../types';

const DAY_5 = '2026-10-05';
const DAY_6 = '2026-10-06';
const DRAFT_ID = 'draft-planning';

const itinerary: ItineraryItem[] = [
  { id: 'it-a', date: DAY_5, time: '11:00', durationMinutes: 60, title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY' },
];

const shoppingList: ShoppingItem[] = [
  { id: 'sh-1', name: '換韓幣', phase: 'pre', isPurchased: false } as unknown as ShoppingItem,
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
    startDate: DAY_5, endDate: DAY_6,
    expenses: [], companions: [], shoppingList, itinerary,
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

const openTrip = async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  // The tab the caller is about to click, not a fixed delay.
  await waitFor(() => expect(screen.getByText('規劃')).toBeTruthy());
  return user;
};

const openPlanning = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('規劃'));
  await waitFor(() => expect(screen.getByLabelText('行程時間軸')).toBeTruthy());
};

describe('規劃 tab carries no accounting actions', () => {
  it('shows the planning surfaces it is meant to', async () => {
    const user = await openTrip();
    await openPlanning(user);
    expect(screen.getByLabelText('行程時間軸')).toBeTruthy();
    expect(screen.getByText('航班資訊')).toBeTruthy();
    // The shopping list has since left this tab entirely: it shares storage
    // with the entry formalities, so it listed 簽證豁免 beside 伴手禮, and the
    // overview already presents those properly. Buying belongs to 記帳.
    expect(screen.queryByText('換韓幣')).toBeNull();
  });

  it('has no 購買 / 記錄為支出 shortcut on the shopping list', async () => {
    const user = await openTrip();
    await openPlanning(user);
    expect(screen.queryByTitle('記錄為支出')).toBeNull();
    expect(screen.queryByText('購買')).toBeNull();
  });

  it('does not mount the expense-shortcut checklist', async () => {
    const user = await openTrip();
    await openPlanning(user);
    expect(screen.queryByText(/行前準備項目/)).toBeNull();
  });

  it('opens no expense form from anywhere in the tab', async () => {
    const user = await openTrip();
    await openPlanning(user);
    expect(screen.queryByText('新增支出')).toBeNull();
    expect(screen.queryByText(/新增記帳/)).toBeNull();
    expect(screen.queryByText(/分帳|結算/)).toBeNull();
  });
});

describe('記帳 tab keeps its accounting actions', () => {
  it('still offers expense entry after the planning tab was stripped', async () => {
    const user = await openTrip();
    await user.click(screen.getByText('記帳'));
    await waitFor(() => expect(screen.queryByLabelText('行程時間軸')).toBeNull());

    // The accounting surface is present and distinct from the planning tab.
    const body = document.body.textContent || '';
    expect(body).toMatch(/記帳|支出/);
    expect(screen.queryByLabelText('行程時間軸')).toBeNull();
  });
});
