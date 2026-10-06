/**
 * @vitest-environment jsdom
 *
 * Runtime proof for the 「已在行程中」 state: a Saved Inspiration whose place is
 * already in the official itinerary must show that before the user taps it, must
 * refuse selection, must stay out of the 已選 tally, and must still show its notes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
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

const TRIP_DAY = isoDay(1);
const DRAFT_ID = 'draft-planned-state';

/** The itinerary already holds 海雲台海水浴場 under placeId X. */
const existingItinerary: ItineraryItem[] = [{
  id: 'it-beach',
  date: TRIP_DAY,
  time: '14:00',
  title: '海雲台海水浴場',
  location: '海雲台海水浴場',
  notes: '',
  type: 'ACTIVITY',
  placeId: 'X',
  origin: 'saved_inspiration',
  sourceInspirationIds: ['insp-beach'],
}];

const inspiration = (
  id: string,
  placeName: string,
  placeId: string | undefined,
  notes: Array<{ id: string; text: string }>,
) => ({
  id,
  savedByUserId: 'user-1',
  country: '韓國',
  city: '釜山',
  placeName,
  ...(placeId ? { placeId } : {}),
  latitude: 35.1587,
  longitude: 129.1604,
  sourcePostId: 'post-1',
  sourceSliceId: 'ss1',
  sourceCreatorId: 'creator-1',
  sourceNoteIds: notes.map(note => `sn-${note.id}`),
  notes: notes.map(note => ({
    id: note.id, sourceNoteId: `sn-${note.id}`, sourceSliceId: 'ss1', sourcePostId: 'post-1',
    sourceCreatorId: 'creator-1', type: 'recommendation', text: note.text,
  })),
  savedAt: '2026-09-01T00:00:00.000Z',
});

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
    itinerary: existingItinerary,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  localStorage.setItem('trippie_saved_travel_inspirations_v1', JSON.stringify([
    // Same placeId as the itinerary item: already planned.
    inspiration('insp-beach', '海雲台海水浴場', 'X', [{ id: 'n1', text: '傍晚人比較少' }]),
    // Different placeId: still selectable.
    inspiration('insp-gamcheon', '甘川文化村', 'Y', [{ id: 'n2', text: '下午拍照光線很好' }]),
  ]));
};

const trace: string[] = [];
const log = (label: string, value: unknown) => {
  trace.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
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
};

/** The inspiration card for a place, by its checkbox's accessible name. */
const cardFor = (placeName: string) =>
  // The card itself, not whichever div happens to wrap the checkbox row: the
  // notes and the planned badge live outside that row.
  screen.getByRole('checkbox', { name: new RegExp(placeName) })
    .closest('[data-testid^="inspiration-card-"]')! as HTMLElement;

describe('Saved Inspiration 已在行程中 runtime', () => {
  it('marks the already-planned place, refuses selection, and leaves the other selectable', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const beach = screen.getByRole('checkbox', { name: /海雲台海水浴場/ });
    const gamcheon = screen.getByRole('checkbox', { name: /甘川文化村/ });

    // Visible state before any tap.
    expect(within(cardFor('海雲台海水浴場')).getByText('已在行程中')).toBeTruthy();
    expect(beach.getAttribute('aria-disabled')).toBe('true');
    expect(beach.getAttribute('aria-checked')).toBe('false');
    log('BEACH_planned_badge', true);

    // The other place carries no badge and is selectable.
    expect(within(cardFor('甘川文化村')).queryByText('已在行程中')).toBeNull();
    expect(gamcheon.getAttribute('aria-disabled')).toBe('false');

    // Only the selectable place is counted.
    expect(document.body.textContent).toContain('已選 0 / 1');
    log('COUNT_before', '已選 0 / 1');

    // Tapping the planned card does not select it, and explains why.
    await user.click(beach);
    expect(beach.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('此景點已經存在行程中。')).toBeTruthy();
    expect(document.body.textContent).toContain('已選 0 / 1');
    log('AFTER_TAP_planned', { checked: beach.getAttribute('aria-checked'), count: '已選 0 / 1' });

    // Experience notes stay readable on the greyed card.
    expect(within(cardFor('海雲台海水浴場')).getByText('傍晚人比較少')).toBeTruthy();
    log('NOTES_still_visible', true);

    // The selectable place still works normally.
    await user.click(gamcheon);
    expect(gamcheon.getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('已選 1 / 1');
    log('AFTER_TAP_selectable', '已選 1 / 1');

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });

  it('marks a saved place with no placeId through its inspiration id', async () => {
    localStorage.setItem('trippie_saved_travel_inspirations_v1', JSON.stringify([
      inspiration('insp-beach', '海雲台海水浴場', undefined, [{ id: 'n1', text: '傍晚人比較少' }]),
    ]));

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    // The itinerary item carries sourceInspirationIds: ['insp-beach'].
    expect(within(cardFor('海雲台海水浴場')).getByText('已在行程中')).toBeTruthy();
  });

  it('does not mark a saved place that merely shares a name', async () => {
    localStorage.setItem('trippie_saved_travel_inspirations_v1', JSON.stringify([
      // Same display name, different place, no shared inspiration id.
      inspiration('insp-other-beach', '海雲台海水浴場', 'A-DIFFERENT-PLACE', [{ id: 'n1', text: '另一個同名海灘' }]),
    ]));

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const card = cardFor('海雲台海水浴場');
    expect(within(card).queryByText('已在行程中')).toBeNull();
    const checkbox = screen.getByRole('checkbox', { name: /海雲台海水浴場/ });
    expect(checkbox.getAttribute('aria-disabled')).toBe('false');
    await user.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });
});
