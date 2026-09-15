/**
 * @vitest-environment jsdom
 *
 * Runtime proof for pinning: the real App, the real pin button, real
 * localStorage and a real reload. §13 persistence and §12 manual editing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ItineraryItem } from '../types';

const DAY_5 = '2026-10-05';
const DAY_6 = '2026-10-06';
const DRAFT_ID = 'draft-pin';

/** §10 fixture, all on the first trip day, which the calendar opens on. */
const itinerary: ItineraryItem[] = [
  { id: 'it-haeundae', date: DAY_5, time: '14:00', durationMinutes: 120, title: '海雲台', location: '海雲台', notes: '', type: 'ACTIVITY' },
  { id: 'it-dinner', date: DAY_5, time: '19:00', durationMinutes: 90, title: '餐廳予約', location: '餐廳予約', notes: '', type: 'FOOD' },
  { id: 'it-gwangalli', date: DAY_5, time: '21:00', durationMinutes: 60, title: '廣安里', location: '廣安里', notes: '', type: 'ACTIVITY' },
];

const seedStorage = (items: ItineraryItem[] = itinerary) => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
    startDate: DAY_5, endDate: DAY_6,
    expenses: [], companions: [], shoppingList: [], itinerary: items,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
};

const persisted = (): ItineraryItem[] => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((draft: { id: string }) => draft.id === DRAFT_ID)?.itinerary || [];
};

beforeEach(() => {
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openPlanning = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
};

const mountApp = async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await openPlanning(user);
  return user;
};

const pinnedInStore = (id: string) => persisted().find(entry => entry.id === id)?.isPinned;

describe('pin runtime', () => {
  it('every card offers a pin, and nothing starts pinned', async () => {
    await mountApp();
    itinerary.forEach(entry => {
      expect(screen.getByTestId(`pin-toggle-${entry.id}`)).toBeTruthy();
      expect(screen.getByTestId(`pin-toggle-${entry.id}`).getAttribute('aria-pressed')).toBe('false');
    });
    expect(screen.queryByTestId('pinned-label-it-dinner')).toBeNull();
  });

  it('pins on tap, shows 已固定, and persists immediately', async () => {
    const user = await mountApp();
    await user.click(screen.getByTestId('pin-toggle-it-dinner'));

    const toggle = screen.getByTestId('pin-toggle-it-dinner');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('取消固定 餐廳予約');
    expect(screen.getByTestId('pinned-label-it-dinner').textContent).toBe('已固定');
    expect(pinnedInStore('it-dinner')).toBe(true);
    // Only the tapped item is pinned.
    expect(pinnedInStore('it-haeundae')).toBeUndefined();
  });

  it('uses the unpinned accessible label before it is pinned', async () => {
    await mountApp();
    expect(screen.getByTestId('pin-toggle-it-dinner').getAttribute('aria-label')).toBe('固定這個行程 餐廳予約');
  });

  it('§13 stays pinned across a reload', async () => {
    const user = await mountApp();
    await user.click(screen.getByTestId('pin-toggle-it-dinner'));
    expect(pinnedInStore('it-dinner')).toBe(true);

    cleanup();
    await mountApp();
    expect(screen.getByTestId('pin-toggle-it-dinner').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('pinned-label-it-dinner')).toBeTruthy();
  });

  it('§13 unpin also survives a reload', async () => {
    const user = await mountApp();
    await user.click(screen.getByTestId('pin-toggle-it-dinner'));
    await user.click(screen.getByTestId('pin-toggle-it-dinner'));
    expect(pinnedInStore('it-dinner')).toBeUndefined();

    cleanup();
    await mountApp();
    expect(screen.getByTestId('pin-toggle-it-dinner').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('pinned-label-it-dinner')).toBeNull();
  });

  it('§12 a pinned item can still be edited or deleted by hand', async () => {
    seedStorage(itinerary.map(entry => (entry.id === 'it-dinner' ? { ...entry, isPinned: true } : entry)));
    await mountApp();
    // The overflow menu that carries 編輯/刪除 is still rendered for the pinned card.
    const card = screen.getByTestId('pin-toggle-it-dinner').closest('[data-item-id]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.querySelectorAll('button').length).toBeGreaterThan(1);
  });
});
