/**
 * @vitest-environment jsdom
 *
 * Runtime proof for the time-distribution fixture: the model returns three
 * activities on one day all stamped 09:00, the user has asked to leave after
 * 11:00, and the accepted official itinerary must still end up with distinct,
 * chronological, non-overlapping times that survive a reload.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ItineraryItem } from '../types';

const TRIP_DAY = '2026-10-04';
const DRAFT_ID = 'draft-times';

/** Exactly the Founder's Day 3: every activity at 09:00. */
const FLAT_RESPONSE = {
  days: [{
    date: TRIP_DAY,
    items: [
      { placeName: '海東龍宮寺', suggestedStartTime: '09:00', durationMinutes: 90, sourceInspirationIds: ['insp-haedong'] },
      { placeName: '海雲台藍線公園膠囊列車', suggestedStartTime: '09:00', durationMinutes: 60, sourceInspirationIds: [] },
      { placeName: '海雲台海水浴場', suggestedStartTime: '09:00', durationMinutes: 120, sourceInspirationIds: [] },
    ],
  }],
  warnings: [],
};

let modelResponse: Record<string, unknown> = FLAT_RESPONSE;

const seedStorage = () => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID,
    name: '釜山測試行程',
    destination: '釜山',
    destinationCountry: '韓國',
    startDate: TRIP_DAY,
    endDate: TRIP_DAY,
    expenses: [], companions: [], shoppingList: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  localStorage.setItem('trippie_saved_travel_inspirations_v1', JSON.stringify([{
    id: 'insp-haedong',
    savedByUserId: 'user-1',
    country: '韓國',
    city: '釜山',
    placeName: '海東龍宮寺',
    placeId: 'place-haedong',
    latitude: 35.1885,
    longitude: 129.2233,
    sourcePostId: 'post-1', sourceSliceId: 'ss1', sourceCreatorId: 'creator-1',
    sourceNoteIds: [], notes: [],
    savedAt: '2026-09-01T00:00:00.000Z',
  }]));
};

const persistedItinerary = (): ItineraryItem[] => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((draft: { id: string }) => draft.id === DRAFT_ID)?.itinerary || [];
};

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

const trace: string[] = [];
const log = (label: string, value: unknown) => {
  trace.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
};

beforeEach(() => {
  modelResponse = FLAT_RESPONSE;
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/itinerary-proposals')) {
      return { ok: true, status: 200, json: async () => modelResponse } as unknown as Response;
    }
    // Place resolution and photos are refused: this ticket is about the clock only.
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openPlanning = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
};

const acceptWithPreference = async (user: ReturnType<typeof userEvent.setup>, preference?: string) => {
  await user.click(screen.getByRole('checkbox', { name: /海東龍宮寺/ }));
  if (preference) await user.type(screen.getByLabelText(/告訴 AI 你想怎麼玩/), preference);
  await user.click(screen.getByText(/AI 幫我排行程/));
  await waitFor(() => expect(screen.getByText('接受這份行程')).toBeTruthy());
};

describe('AI itinerary time distribution runtime', () => {
  it('repairs a flat 09:00 day, respects 「每天 11 點後出門」, and keeps the times across a reload', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await acceptWithPreference(user, '每天 11 點後出門');

    // The preview already shows distinct times — the user never sees three 09:00s.
    const previewTimes = Array.from(document.body.textContent?.matchAll(/\b([01]\d|2[0-3]):[0-5]\d\b/g) || []).map(match => match[0]);
    log('PREVIEW_TIMES', previewTimes);

    await user.click(screen.getByText('接受這份行程'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });

    const persisted = persistedItinerary();
    log('PERSISTED', persisted.map(entry => `${entry.time} ${entry.title}`));
    expect(persisted).toHaveLength(3);

    const times = persisted.map(entry => entry.time);
    // 1. Every activity has a real time.
    expect(times.every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))).toBe(true);
    // 2. All distinct — the reported bug.
    expect(new Set(times).size).toBe(3);
    // 3. Chronological.
    expect([...times].sort()).toEqual(times);
    // 4. The user's 11:00 instruction is honoured by the first activity.
    expect(toMinutes(times[0])).toBeGreaterThanOrEqual(toMinutes('11:00'));
    // 5. No silent overlap: each starts after the previous one's duration.
    const durations = [90, 60, 120];
    const order = ['海東龍宮寺', '海雲台藍線公園膠囊列車', '海雲台海水浴場'];
    expect(persisted.map(entry => entry.title)).toEqual(order);
    for (let index = 0; index + 1 < persisted.length; index += 1) {
      expect(toMinutes(times[index + 1])).toBeGreaterThanOrEqual(toMinutes(times[index]) + durations[index]);
    }

    // The calendar renders them as distinct rows.
    await user.click(screen.getByText('規劃'));
    const calendar = within(screen.getByLabelText('行程時間軸'));
    times.forEach(time => expect(calendar.getAllByText(time).length).toBeGreaterThan(0));

    // Reload.
    cleanup();
    render(<App />);
    const user2 = userEvent.setup();
    await openPlanning(user2);
    const hydrated = persistedItinerary();
    log('AFTER_RELOAD', hydrated.map(entry => `${entry.time} ${entry.title}`));
    expect(hydrated.map(entry => entry.time)).toEqual(times);
    const reloadedCalendar = within(screen.getByLabelText('行程時間軸'));
    times.forEach(time => expect(reloadedCalendar.getAllByText(time).length).toBeGreaterThan(0));

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });

  it('spreads a flat day even with no preference, starting from the normal day start', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await acceptWithPreference(user);
    await user.click(screen.getByText('接受這份行程'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });

    const times = persistedItinerary().map(entry => entry.time);
    log('NO_PREFERENCE', times);
    expect(times[0]).toBe('09:00');
    expect(new Set(times).size).toBe(3);
    expect([...times].sort()).toEqual(times);
  });

  it('leaves a day the model already scheduled well exactly as it is', async () => {
    modelResponse = {
      days: [{
        date: TRIP_DAY,
        items: [
          { placeName: '海東龍宮寺', suggestedStartTime: '11:00', durationMinutes: 90, sourceInspirationIds: ['insp-haedong'] },
          { placeName: '海雲台藍線公園膠囊列車', suggestedStartTime: '14:00', durationMinutes: 60, sourceInspirationIds: [] },
          { placeName: '海雲台海水浴場', suggestedStartTime: '16:30', durationMinutes: 120, sourceInspirationIds: [] },
        ],
      }],
      warnings: [],
    };

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await acceptWithPreference(user);
    await user.click(screen.getByText('接受這份行程'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });

    const times = persistedItinerary().map(entry => entry.time);
    log('MODEL_TIMES_KEPT', times);
    // Nothing was recomputed: the model got this day right.
    expect(times).toEqual(['11:00', '14:00', '16:30']);
  });
});
