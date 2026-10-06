/**
 * @vitest-environment jsdom
 *
 * Runtime proof that conflict UI reflects the CURRENT itinerary only: red
 * styling and warning banners appear while an overlap exists and disappear the
 * moment it is resolved, with no reload and no remembered flag.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ItineraryItem } from '../types';

/*
  Derived from the clock, not written down.

  The itinerary only offers days that have not happened yet — 「ai排行程會排到已經
  失效的日期」 — so a fixture with fixed dates stops exercising this the moment the
  real date passes it. These did, overnight.
*/
const isoDay = (offset: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const DAY_5 = isoDay(1);
const DAY_6 = isoDay(2);
const DRAFT_ID = 'draft-conflict';

/** §8 fixture: SPA LAND runs 16:00–19:00, so a 17:00 start overlaps it. */
const overlapping: ItineraryItem[] = [
  { id: 'it-spa', date: DAY_5, time: '16:00', durationMinutes: 180, title: 'SPA LAND Centum City', location: 'SPA LAND Centum City', notes: '', type: 'ACTIVITY' },
  { id: 'it-centum', date: DAY_5, time: '17:00', durationMinutes: 120, title: '新世界百貨 Centum City', location: '新世界百貨 Centum City', notes: '', type: 'ACTIVITY' },
];

const seedStorage = (items: ItineraryItem[]) => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID, name: '釜山測試行程', destination: '釜山',
    startDate: DAY_5, endDate: DAY_6,
    expenses: [], companions: [], shoppingList: [], itinerary: items,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
};

beforeEach(() => {
  seedStorage(overlapping);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mountApp = async () => {
  const { default: App } = await import('../App');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
  await waitFor(() => expect(screen.getByLabelText('行程時間軸')).toBeTruthy());
  return user;
};

const rows = () =>
  Array.from(screen.getByLabelText('行程時間軸').querySelectorAll('[data-item-id]')) as HTMLElement[];

const conflictIds = () =>
  rows().filter(node => node.getAttribute('data-collision') === 'true').map(node => node.getAttribute('data-item-id'));

/** Reschedules one item through the same canonical path the UI uses. */
const setTime = (id: string, time: string) => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  const draft = drafts.find((entry: { id: string }) => entry.id === DRAFT_ID);
  draft.itinerary = draft.itinerary.map((item: ItineraryItem) =>
    item.id === id ? { ...item, time } : item,
  );
  localStorage.setItem('trippie_drafts_v1', JSON.stringify(drafts));
};

/** Drags one card's time handle by whole 30-minute steps (40px each). */
const dragTime = (title: string, steps: number) => {
  // The handle itself owns the pointer move/up handlers.
  const handle = screen.getByRole('button', { name: `拖曳排序 ${title}` });
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 200 });
  const target = { pointerId: 1, clientX: 10, clientY: 200 + steps * 40 };
  fireEvent.pointerMove(handle, target);
  fireEvent.pointerUp(handle, target);
};

describe('conflict state is derived, never remembered', () => {
  it('§4 a drag that resolves the overlap clears the red state immediately', async () => {
    await mountApp();
    expect(conflictIds()).toHaveLength(2);

    // 17:00 -> 20:00 is six 30-minute steps later; SPA LAND ends at 19:00.
    dragTime('新世界百貨 Centum City', 6);

    expect(rows().find(node => node.getAttribute('data-item-id') === 'it-centum')?.getAttribute('data-start')).toBe('20:00');
    expect(conflictIds()).toEqual([]);
  });

  it('§4 a drag that creates an overlap marks it immediately', async () => {
    cleanup();
    seedStorage([
      overlapping[0],
      { ...overlapping[1], time: '20:00' },
    ]);
    await mountApp();
    expect(conflictIds()).toEqual([]);

    // Pull it back on top of SPA LAND.
    dragTime('新世界百貨 Centum City', -6);
    expect(conflictIds().sort()).toEqual(['it-centum', 'it-spa']);
  });

  it('§8 marks both overlapping cards while the overlap exists', async () => {
    await mountApp();
    expect(conflictIds().sort()).toEqual(['it-centum', 'it-spa']);
  });

  it('§8 clears both cards once the overlap is resolved, without a reload', async () => {
    await mountApp();
    expect(conflictIds()).toHaveLength(2);

    // Move 新世界百貨 to 20:00 — SPA LAND ends at 19:00, so nothing overlaps.
    cleanup();
    setTime('it-centum', '20:00');
    await mountApp();

    expect(conflictIds()).toEqual([]);
    expect(rows()).toHaveLength(2);
  });

  it('§8 moving the item to another day also clears the conflict', async () => {
    cleanup();
    seedStorage([overlapping[0], { ...overlapping[1], date: DAY_6 }]);
    await mountApp();
    expect(conflictIds()).toEqual([]);
  });

  it('§3 shows no late banner for an ordinary day', async () => {
    await mountApp();
    expect(screen.queryByText('調整後部分行程時間較晚，請確認安排。')).toBeNull();
  });

  it('§7 the late banner follows the current day, not a past drag', async () => {
    cleanup();
    // 23:00 is past the late boundary, so the notice is true right now.
    seedStorage([{ ...overlapping[0], time: '23:00', durationMinutes: 60 }]);
    await mountApp();
    expect(screen.getByText('調整後部分行程時間較晚，請確認安排。')).toBeTruthy();

    // Pull it back into the day and the notice must go with it.
    cleanup();
    setTime('it-spa', '14:00');
    await mountApp();
    expect(screen.queryByText('調整後部分行程時間較晚，請確認安排。')).toBeNull();
  });

  it('§9 resolving one of several conflicts keeps the rest highlighted', async () => {
    cleanup();
    seedStorage([
      ...overlapping,
      { id: 'it-beach', date: DAY_5, time: '09:00', durationMinutes: 120, title: '海雲台', location: '海雲台', notes: '', type: 'ACTIVITY' },
      { id: 'it-cafe', date: DAY_5, time: '10:00', durationMinutes: 60, title: '咖啡廳', location: '咖啡廳', notes: '', type: 'ACTIVITY' },
    ]);
    await mountApp();
    expect(conflictIds().sort()).toEqual(['it-beach', 'it-cafe', 'it-centum', 'it-spa']);

    // Resolve only the morning pair.
    cleanup();
    setTime('it-cafe', '11:30');
    await mountApp();
    expect(conflictIds().sort()).toEqual(['it-centum', 'it-spa']);
  });

  it('§9 the last resolution clears everything', async () => {
    cleanup();
    setTime('it-centum', '20:00');
    await mountApp();
    expect(conflictIds()).toEqual([]);
    expect(screen.queryByText('行程順序已更新，請確認時間安排。')).toBeNull();
  });

  it('§8 a reload does not resurrect a resolved conflict', async () => {
    await mountApp();
    expect(conflictIds()).toHaveLength(2);

    cleanup();
    setTime('it-centum', '20:00');
    await mountApp();
    expect(conflictIds()).toEqual([]);

    // Reload again: still clean, because nothing about the conflict was stored.
    cleanup();
    await mountApp();
    expect(conflictIds()).toEqual([]);
  });
});
