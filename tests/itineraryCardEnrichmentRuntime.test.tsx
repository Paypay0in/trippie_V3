/**
 * @vitest-environment jsdom
 *
 * Runtime proof for the Lane M acceptance fixture: accepting a proposal must
 * persist real place identity for an AI-suggested place, carry the Saved
 * Inspiration's travel notes onto the official itinerary item, render both on the
 * normal itinerary card, and keep all of it across a reload.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ItineraryItem } from '../types';

/*
  Today, not a date in the calendar.

  This was hard-coded to 2026-10-02, with the trip starting and ending that day.
  It passed for as long as that day was today and began failing the moment the
  clock rolled past it — 「繼續旅程」 is not offered for a trip that is over, so
  the whole file could no longer reach 規劃. No code changed; the date did.

  Derived from the clock instead, so the trip under test is always the trip the
  app considers current.
*/
const TRIP_START = (() => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
})();
const DRAFT_ID = 'draft-enrich';

const savedNotes = [
  { id: 'n1', sourceNoteId: 'sn1', sourceSliceId: 'ss1', sourcePostId: 'post-1', sourceCreatorId: 'creator-1', type: 'recommendation', text: '下午拍照光線很好' },
  { id: 'n2', sourceNoteId: 'sn2', sourceSliceId: 'ss1', sourcePostId: 'post-1', sourceCreatorId: 'creator-1', type: 'timing', text: '建議預留兩小時' },
  { id: 'n3', sourceNoteId: 'sn3', sourceSliceId: 'ss1', sourcePostId: 'post-1', sourceCreatorId: 'creator-1', type: 'queue', text: '週末人很多' },
  { id: 'n4', sourceNoteId: 'sn4', sourceSliceId: 'ss1', sourcePostId: 'post-1', sourceCreatorId: 'creator-1', type: 'practical', text: '穿好走的鞋' },
];

/** Only 札嘎其市場 resolves; nothing else is allowed a Google identity. */
const JAGALCHI = {
  placeId: 'ChIJ-jagalchi',
  resolvedPlaceName: '札嘎其市場',
  address: '52 Jagalchihaean-ro, Jung-gu, Busan',
  latitude: 35.0966339,
  longitude: 129.0307965,
  country: '南韓',
};

const seedStorage = () => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID,
    name: '釜山測試行程',
    destination: '釜山',
    destinationCountry: '韓國',
    startDate: TRIP_START,
    endDate: TRIP_START,
    expenses: [],
    companions: [],
    shoppingList: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  localStorage.setItem('trippie_saved_travel_inspirations_v1', JSON.stringify([{
    id: 'insp-gamcheon',
    savedByUserId: 'user-1',
    country: '韓國',
    city: '釜山',
    placeName: '甘川文化村',
    placeId: 'place-gamcheon',
    formattedAddress: '203 Gamnae 2-ro, Saha-gu, Busan',
    latitude: 35.0975,
    longitude: 129.0107,
    sourcePostId: 'post-1',
    sourceSliceId: 'ss1',
    sourceCreatorId: 'creator-1',
    sourceNoteIds: savedNotes.map(note => note.sourceNoteId),
    notes: savedNotes,
    savedAt: '2026-09-01T00:00:00.000Z',
  }]));
};

const persistedItinerary = (): ItineraryItem[] => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((draft: { id: string }) => draft.id === DRAFT_ID)?.itinerary || [];
};

const trace: string[] = [];
const log = (label: string, value: unknown) => {
  trace.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
};

beforeEach(() => {
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    const body = JSON.parse(String(init?.body || '{}'));

    if (target.includes('/api/itinerary-proposals')) {
      return {
        ok: true, status: 200, json: async () => ({
          days: [{
            date: TRIP_START,
            items: [
              { placeName: '甘川文化村', suggestedStartTime: '16:30', note: '傍晚光線好', sourceInspirationIds: ['insp-gamcheon'] },
              { placeName: '札嘎其市場', suggestedStartTime: '18:30', note: '晚餐海鮮', sourceInspirationIds: [] },
            ],
          }],
          warnings: [],
        }),
      } as unknown as Response;
    }

    if (target.includes('/api/places/resolve')) {
      const query = String(body.query || '');
      return {
        ok: true, status: 200,
        json: async () => (query.includes('札嘎其市場') ? JAGALCHI : null),
      } as unknown as Response;
    }

    if (target.includes('/api/places/photo')) {
      return {
        ok: true, status: 200,
        json: async () => ({ photo: { imageUrl: `https://photos.example/${body.placeId}.jpg`, attribution: { displayName: 'Google', uri: 'https://maps.example' } } }),
      } as unknown as Response;
    }

    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The itinerary calendar only. The planner below it lists the same note text. */
const card = () => within(screen.getByLabelText('行程時間軸'));

const openPlanning = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
};

describe('itinerary card enrichment runtime', () => {
  it('persists place identity and saved notes, renders both, and survives a reload', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await user.click(screen.getByRole('checkbox', { name: /甘川文化村/ }));
    await user.click(screen.getByText(/AI 幫我排行程/));
    await waitFor(() => expect(screen.getByText('接受這份行程')).toBeTruthy());
    await user.click(screen.getByText('接受這份行程'));
    await waitFor(() => expect(persistedItinerary()).toHaveLength(2));

    const persisted = persistedItinerary();
    log('PERSISTED', persisted.map(entry => `${entry.time} ${entry.title} origin=${entry.origin} placeId=${entry.placeId || '-'} notes=${entry.savedTravelNotes?.length ?? 0}`));
    expect(persisted).toHaveLength(2);

    // Saved Inspiration item: identity reused, notes carried, provenance intact.
    const gamcheon = persisted.find(entry => entry.title === '甘川文化村')!;
    expect(gamcheon).toMatchObject({
      time: '16:30',
      placeId: 'place-gamcheon',
      address: '203 Gamnae 2-ro, Saha-gu, Busan',
      latitude: 35.0975,
      longitude: 129.0107,
      origin: 'saved_inspiration',
    });
    expect(gamcheon.sourceInspirationIds).toEqual(['insp-gamcheon']);
    expect(gamcheon.savedTravelNotes?.map(note => note.text)).toEqual(['下午拍照光線很好', '建議預留兩小時', '週末人很多', '穿好走的鞋']);

    // AI-suggested item: resolved through the existing Places service, still AI.
    const jagalchi = persisted.find(entry => entry.title === '札嘎其市場')!;
    expect(jagalchi).toMatchObject({
      time: '18:30',
      placeId: 'ChIJ-jagalchi',
      address: '52 Jagalchihaean-ro, Jung-gu, Busan',
      origin: 'ai_suggestion',
    });
    expect(jagalchi.sourceInspirationIds).toBeUndefined();
    // Provenance is not earned by a name or a lookup.
    expect(jagalchi.savedTravelNotes).toBeUndefined();

    // The normal itinerary card shows it all.
    await user.click(screen.getByText('規劃'));
    await waitFor(() => expect(card().getByText('旅行筆記')).toBeTruthy());
    expect(card().getByText('下午拍照光線很好')).toBeTruthy();
    expect(card().getByText('建議預留兩小時')).toBeTruthy();
    expect(card().getByText('週末人很多')).toBeTruthy();
    // Capped at three until asked; the card cannot be stretched by a noted place.
    expect(card().queryByText('穿好走的鞋')).toBeNull();
    expect(card().getByText('查看全部（4）')).toBeTruthy();
    await user.click(card().getByText('查看全部（4）'));
    expect(card().getByText('穿好走的鞋')).toBeTruthy();

    // Addresses and real photos are on the cards.
    expect(card().getByText('203 Gamnae 2-ro, Saha-gu, Busan')).toBeTruthy();
    expect(card().getByText('52 Jagalchihaean-ro, Jung-gu, Busan')).toBeTruthy();
    const photos = Array.from(document.querySelectorAll('img')).map(image => image.getAttribute('src'));
    log('CARD_PHOTOS', photos.filter(src => src?.includes('photos.example')));
    expect(photos).toContain('https://photos.example/place-gamcheon.jpg');
    expect(photos).toContain('https://photos.example/ChIJ-jagalchi.jpg');

    // Only the saved item shows notes: there is exactly one 旅行筆記 block.
    expect(card().getAllByText('旅行筆記')).toHaveLength(1);

    // Reload.
    cleanup();
    render(<App />);
    const user2 = userEvent.setup();
    await openPlanning(user2);
    await waitFor(() => expect(persistedItinerary().find(entry => entry.title === '甘川文化村')?.savedTravelNotes).toHaveLength(4));

    const hydrated = persistedItinerary();
    log('AFTER_RELOAD', hydrated.map(entry => `${entry.time} ${entry.title} placeId=${entry.placeId || '-'} notes=${entry.savedTravelNotes?.length ?? 0}`));
    expect(hydrated.find(entry => entry.title === '甘川文化村')?.savedTravelNotes).toHaveLength(4);
    expect(hydrated.find(entry => entry.title === '札嘎其市場')?.placeId).toBe('ChIJ-jagalchi');
    expect(card().getByText('旅行筆記')).toBeTruthy();
    expect(card().getByText('下午拍照光線很好')).toBeTruthy();
    expect(card().getByText('203 Gamnae 2-ro, Saha-gu, Busan')).toBeTruthy();

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });

  it('drops saved notes on reload when their inspiration linkage is gone', async () => {
    // Notes exist because a saved place existed. Storage that has lost the linkage
    // cannot prove whose notes these are, so they must not be rendered as if it could.
    localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
      id: DRAFT_ID,
      name: '釜山測試行程',
      destination: '釜山',
      startDate: TRIP_START,
      endDate: TRIP_START,
      expenses: [], companions: [], shoppingList: [],
      itinerary: [{
        id: 'it-orphan', date: TRIP_START, time: '16:30', title: '甘川文化村', location: '甘川文化村',
        notes: '', type: 'ACTIVITY', origin: 'ai_suggestion',
        savedTravelNotes: savedNotes,
      }],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }]));

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    expect(card().queryByText('旅行筆記')).toBeNull();
    expect(card().queryByText('下午拍照光線很好')).toBeNull();
  });
});
