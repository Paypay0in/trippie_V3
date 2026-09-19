/**
 * @vitest-environment jsdom
 *
 * Publishing a help request must not tick the to-dos it names.
 *
 * The two are easy to conflate — the request is about those tasks, and a helper
 * taking them on feels like progress — but a checklist that ticks itself when
 * someone is merely asked would tell the traveller the booking exists before
 * anyone has made it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen } from '@testing-library/react';

const DRAFT_ID = 'draft-service';
const START = '2099-12-20';
const END = '2099-12-27';

const draft = {
  id: DRAFT_ID,
  name: '日本滑雪行程',
  destination: '日本',
  startDate: START,
  endDate: END,
  expenses: [],
  companions: [],
  itinerary: [],
  shoppingList: [
    { id: 'task-ski-1', name: '預約橫濱 Snova 室內滑雪場', isPurchased: false, phase: 'pre' },
    { id: 'task-ski-2', name: '預約滑雪裝備全套租借', isPurchased: false, phase: 'pre' },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([draft]));
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

const persistedTasks = () => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((entry: any) => entry.id === DRAFT_ID)?.shoppingList ?? [];
};

describe('service request runtime', () => {
  it('selects a to-do for help without completing it', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('旅行'));
    await user.click(screen.getByText(/繼續旅程/));
    await settle();

    const addButtons = screen.queryAllByText('＋ 加入協助任務');
    // Both to-dos are bookings, which is work a person can take on.
    expect(addButtons.length).toBeGreaterThan(0);

    await user.click(addButtons[0]);
    await settle();

    expect(screen.getByText(/已選 1 項/)).toBeTruthy();
    // Selecting is not completing, and neither is publishing.
    expect(persistedTasks().every((task: any) => !task.isPurchased)).toBe(true);
  });

  it('opens one request covering the selected tasks', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('旅行'));
    await user.click(screen.getByText(/繼續旅程/));
    await settle();

    const addButtons = screen.queryAllByText('＋ 加入協助任務');
    await user.click(addButtons[0]);
    await settle();
    await user.click(screen.getByText('整理成協助需求'));
    await settle();

    // One form for the whole job, with every eligible task listed so the
    // traveller can add the related ones rather than filing them separately.
    // The heading and the publish button share the wording, hence getAllByText.
    expect(screen.getAllByText('發佈協助需求').length).toBeGreaterThan(0);
    expect(screen.getByText(/需要協助的項目/)).toBeTruthy();
    // Each task now appears on its checklist card and again inside the sheet.
    expect(screen.getAllByText('預約橫濱 Snova 室內滑雪場').length).toBeGreaterThan(1);
    expect(screen.getAllByText('預約滑雪裝備全套租借').length).toBeGreaterThan(1);
    expect(screen.getByText(/發佈不會把待辦標成完成/)).toBeTruthy();
    expect(persistedTasks().every((task: any) => !task.isPurchased)).toBe(true);
  });
});
