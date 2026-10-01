/**
 * @vitest-environment jsdom
 *
 * Runtime trace for LANE L: accepted AI proposal -> TripDraft.itinerary ->
 * localStorage -> reload hydration -> official itinerary calendar.
 *
 * This mounts the real App, drives the real UI, reads the real localStorage and
 * remounts a fresh App to stand in for a browser refresh.
 */
import React from 'react';
import type { ItineraryItem } from '../types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';

/*
  Dated relative to today, not pinned.

  These were fixed at 2026-10-01 and 10-02, which made the test a clock: at
  midnight on the first the trip stopped being 「旅行前」, the screen under
  assertion became the during-trip one, and the suite went red on a change that
  had nothing to do with it.
*/
const daysFromToday = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const TRIP_START = daysFromToday(30);
const TRIP_END = daysFromToday(31);
const DRAFT_ID = 'draft-lane-l';

vi.mock('../services/itineraryPlanningService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/itineraryPlanningService')>();
  return {
    ...actual,
    generateTripInspirationProposal: vi.fn(async () => ({
      days: [
        {
          date: TRIP_START,
          items: [
            {
              placeName: '淺草寺',
              placeId: 'place-asakusa',
              suggestedStartTime: '09:00',
              note: '早上人少',
              source: 'saved_inspiration' as const,
              sourceInspirationIds: ['insp-1'],
              coordinates: { latitude: 35.7148, longitude: 139.7967 },
              durationMinutes: 90,
            },
          ],
        },
        {
          date: TRIP_END,
          items: [
            {
              placeName: '築地市場',
              suggestedStartTime: '08:30',
              note: 'AI 建議',
              source: 'ai_suggestion' as const,
              sourceInspirationIds: [],
            },
          ],
        },
      ],
      warnings: [],
      notes: [],
    })),
  };
});

const seedStorage = () => {
  localStorage.clear();
  localStorage.setItem(
    'trippie_drafts_v1',
    JSON.stringify([
      {
        id: DRAFT_ID,
        name: '東京測試行程',
        destination: '東京',
        destinationCountry: '日本',
        startDate: TRIP_START,
        endDate: TRIP_END,
        expenses: [],
        companions: [],
        shoppingList: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]),
  );
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  localStorage.setItem(
    'trippie_saved_travel_inspirations_v1',
    JSON.stringify([
      {
        id: 'insp-1',
        savedByUserId: 'user-1',
        country: '日本',
        city: '東京',
        placeName: '淺草寺',
        placeId: 'place-asakusa',
        latitude: 35.7148,
        longitude: 139.7967,
        sourcePostId: 'post-1',
        sourceSliceId: 'slice-1',
        sourceCreatorId: 'creator-1',
        sourceNoteIds: [],
        notes: [],
        savedAt: '2026-09-01T00:00:00.000Z',
      },
    ]),
  );
};

const readPersistedDraft = () => {
  const raw = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return raw.find((draft: { id: string }) => draft.id === DRAFT_ID);
};

const trace: string[] = [];
const log = (label: string, value: unknown) => {
  trace.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
};

beforeEach(() => {
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LANE L runtime: accepted proposal persists and renders', () => {
  it('writes the accepted itinerary into the active draft and survives a reload', async () => {
    const { default: App } = await import('../App');

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText('旅行'));
    await user.click(screen.getByText(/繼續旅程/));
    await user.click(screen.getByText('規劃'));

    // BEFORE ACCEPT
    log('BEFORE_ACCEPT_persisted_draft_id', readPersistedDraft()?.id);
    log('BEFORE_ACCEPT_persisted_itinerary_count', (readPersistedDraft()?.itinerary || []).length);
    expect(readPersistedDraft()?.id).toBe(DRAFT_ID);
    expect(readPersistedDraft()?.itinerary || []).toHaveLength(0);
    expect(screen.getByText('這一天尚未安排行程')).toBeTruthy();

    await user.click(screen.getByRole('checkbox', { name: /淺草寺/ }));
    await user.click(screen.getByText(/AI 幫我排行程/));
    await waitFor(() => expect(screen.getByText('接受這份行程')).toBeTruthy());

    await user.click(screen.getByText('接受這份行程'));
    await waitFor(() => expect(readPersistedDraft()?.itinerary || []).toHaveLength(2));

    // AFTER ACCEPT — canonical persisted draft actually mutated
    const accepted = readPersistedDraft();
    log('AFTER_ACCEPT_persisted_draft_id', accepted?.id);
    log('AFTER_ACCEPT_persisted_itinerary_count', (accepted?.itinerary || []).length);
    log('AFTER_ACCEPT_persisted_items', (accepted?.itinerary || []).map((item: ItineraryItem) => `${item.date} ${item.time} ${item.title} origin=${item.origin} placeId=${item.placeId || '-'}`));
    expect(accepted?.id).toBe(DRAFT_ID);
    expect(accepted?.itinerary || []).toHaveLength(2);

    // Provenance survives the write.
    const savedSourced = accepted.itinerary.find((item: ItineraryItem) => item.title === '淺草寺');
    expect(savedSourced.placeId).toBe('place-asakusa');
    expect(savedSourced.origin).toBe('saved_inspiration');
    expect(savedSourced.sourceInspirationIds).toEqual(['insp-1']);
    const aiSuggested = accepted.itinerary.find((item: ItineraryItem) => item.title === '築地市場');
    expect(aiSuggested.origin).toBe('ai_suggestion');
    expect(aiSuggested.placeId).toBeUndefined();

    // A successful accept lands the user on the overview, which counts the
    // official itinerary — not proposal UI state.
    expect(document.body.textContent).toContain('2 項行程項目');

    // ...and the official calendar renders the items without a reload.
    await user.click(screen.getByText('規劃'));
    expect(screen.getAllByText('淺草寺').length).toBeGreaterThan(0);
    await user.click(screen.getByText('Day 2'));
    expect(screen.getAllByText('築地市場').length).toBeGreaterThan(0);
    log('AFTER_ACCEPT_calendar_renders', true);

    // AFTER REFRESH — a brand new App tree over the same localStorage.
    cleanup();
    render(<App />);
    const user2 = userEvent.setup();
    await user2.click(screen.getByText('旅行'));
    await user2.click(screen.getByText(/繼續旅程/));
    await user2.click(screen.getByText('規劃'));

    const hydrated = readPersistedDraft();
    log('AFTER_REFRESH_persisted_draft_id', hydrated?.id);
    log('AFTER_REFRESH_persisted_itinerary_count', (hydrated?.itinerary || []).length);
    expect(hydrated?.id).toBe(DRAFT_ID);
    expect(hydrated?.itinerary || []).toHaveLength(2);
    expect(screen.getAllByText('淺草寺').length).toBeGreaterThan(0);
    await user2.click(screen.getByText('Day 2'));
    expect(screen.getAllByText('築地市場').length).toBeGreaterThan(0);
    log('AFTER_REFRESH_calendar_renders', true);

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });
});
