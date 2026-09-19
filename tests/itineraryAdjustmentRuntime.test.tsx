/**
 * @vitest-environment jsdom
 *
 * Runtime proof for AI 行程調整模式: a trip that already has an itinerary must put
 * the AI into adjustment mode, hand it the current plan, keep the official
 * itinerary untouched until the user confirms, and persist the applied result
 * across a reload.
 *
 * The real App is mounted, the real UI is clicked, the real localStorage is read,
 * and a refresh is a full teardown plus a fresh mount over the same storage.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ItineraryItem } from '../types';

const TRIP_START = '2026-10-01';
const TRIP_MID = '2026-10-02';
const TRIP_END = '2026-10-03';
const DRAFT_ID = 'draft-adjust';

/** Captures exactly what the client sent to the itinerary route. */
const requests: Array<Record<string, unknown>> = [];
/** The next raw model response the stubbed route should return. */
let nextResponse: Record<string, unknown> = { changes: [] };
let shouldFailRequest = false;

const busanItinerary: ItineraryItem[] = [
  { id: 'it-gamcheon', date: TRIP_START, time: '09:00', title: '甘川文化村', location: '甘川文化村', notes: '', type: 'ACTIVITY', placeId: 'place-gamcheon', latitude: 35.0975, longitude: 129.0107, origin: 'saved_inspiration', sourceInspirationIds: ['insp-gamcheon'] },
  { id: 'it-haeundae', date: TRIP_START, time: '13:00', title: '海雲台', location: '海雲台', notes: '', type: 'ACTIVITY', placeId: 'place-haeundae', latitude: 35.1587, longitude: 129.1604 },
  { id: 'it-gukje', date: TRIP_START, time: '17:00', title: '國際市場', location: '國際市場', notes: '', type: 'ACTIVITY', placeId: 'place-gukje', latitude: 35.1010, longitude: 129.0263 },
];

const seedStorage = () => {
  localStorage.clear();
  localStorage.setItem('trippie_drafts_v1', JSON.stringify([{
    id: DRAFT_ID,
    name: '釜山測試行程',
    destination: '釜山',
    destinationCountry: '韓國',
    startDate: TRIP_START,
    endDate: TRIP_END,
    expenses: [],
    companions: [],
    shoppingList: [],
    itinerary: busanItinerary,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
  localStorage.setItem('trippie_saved_travel_inspirations_v1', JSON.stringify([{
    id: 'insp-spa',
    savedByUserId: 'user-1',
    country: '韓國',
    city: '釜山',
    placeName: 'SPA LAND Centum City',
    placeId: 'place-spa',
    latitude: 35.1689,
    longitude: 129.1291,
    sourcePostId: 'post-1',
    sourceSliceId: 'slice-1',
    sourceCreatorId: 'creator-1',
    sourceNoteIds: [],
    notes: [],
    savedAt: '2026-09-01T00:00:00.000Z',
  }]));
};

const persistedItinerary = (): ItineraryItem[] => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((draft: { id: string }) => draft.id === DRAFT_ID)?.itinerary || [];
};

const persistedDraftId = (): string | undefined => {
  const drafts = JSON.parse(localStorage.getItem('trippie_drafts_v1') || '[]');
  return drafts.find((draft: { id: string }) => draft.id === DRAFT_ID)?.id;
};

const describeItinerary = (items: ItineraryItem[]) =>
  items.map(entry => `${entry.id} ${entry.date} ${entry.time} ${entry.title}`);

const trace: string[] = [];
const log = (label: string, value: unknown) => {
  trace.push(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
};

beforeEach(() => {
  requests.length = 0;
  nextResponse = { changes: [] };
  shouldFailRequest = false;
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  // Stubbed route: records the canonical input and replays a fixed model response.
  // Place resolution is refused so enrichment stays best-effort and text-only.
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/itinerary-proposals')) {
      requests.push(JSON.parse(String(init?.body || '{}')));
      if (shouldFailRequest) {
        return { ok: false, status: 502, json: async () => ({ error: 'AI 行程調整服務暫時無法使用。' }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => nextResponse } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Opens the seeded trip and lands on the 規劃 section where the planner lives. */
const openPlanning = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('旅行'));
  await user.click(screen.getByText(/繼續旅程/));
  await user.click(screen.getByText('規劃'));
};

const generateWith = async (user: ReturnType<typeof userEvent.setup>, mode: string, response: Record<string, unknown>) => {
  nextResponse = response;
  await user.click(screen.getByRole('radio', { name: new RegExp(mode) }));
  await user.click(screen.getByText('AI 幫我調整行程'));
  await waitFor(() => expect(screen.getByText('套用這些調整')).toBeTruthy());
};

describe('AI 行程調整模式 runtime', () => {
  it('enters adjustment mode and sends the existing itinerary to the AI', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    // The creation CTA is gone; the adjustment prompt is what the user sees.
    expect(screen.getByText('AI 行程調整模式')).toBeTruthy();
    expect(screen.getByText('你目前已經有行程安排了，這次想怎麼調整？')).toBeTruthy();
    expect(screen.queryByText(/AI 幫我排行程/)).toBeNull();
    expect(screen.getByText('補充行程')).toBeTruthy();
    expect(screen.getByText('重新安排路線')).toBeTruthy();
    expect(screen.getByText('重新規劃')).toBeTruthy();

    await generateWith(user, '重新安排路線', {
      summary: '配合 11 點後出門。',
      changes: [{ type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30', reason: '配合「每天11點後出門」' }],
    });

    const sent = requests.at(-1)!;
    log('REQUEST_adjustmentMode', sent.adjustmentMode);
    log('REQUEST_existingItinerary', (sent.existingItinerary as unknown[]).map((entry) => (entry as { id: string; startTime?: string }).id));
    log('REQUEST_analysis', sent.analysis);

    expect(sent.adjustmentMode).toBe('reorder');
    // The AI genuinely receives the current plan, with ids, times and geography.
    expect((sent.existingItinerary as Array<{ id: string }>).map(entry => entry.id))
      .toEqual(['it-gamcheon', 'it-haeundae', 'it-gukje']);
    expect((sent.existingItinerary as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: 'it-gamcheon', date: TRIP_START, startTime: '09:00', placeName: '甘川文化村', placeId: 'place-gamcheon', provenance: 'saved_inspiration', locked: false,
    });
    // And the deterministic read of that plan.
    expect((sent.analysis as { emptyDates: string[] }).emptyDates).toEqual([TRIP_MID, TRIP_END]);
    expect((sent.analysis as { longHops: unknown[] }).longHops.length).toBeGreaterThan(0);
    expect((sent.analysis as { unusedInspirationIds: string[] }).unusedInspirationIds).toEqual([]);
  });

  it('shows a diff preview and leaves the official itinerary untouched until confirmation', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    log('BEFORE_persisted', describeItinerary(persistedItinerary()));

    await generateWith(user, '重新安排路線', {
      summary: '配合 11 點後出門並調順動線。',
      changes: [
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30', reason: '配合「每天11點後出門」' },
        { type: 'move', existingItemId: 'it-gukje', toTime: '15:00', reason: '和甘川文化村同一區' },
      ],
    });

    // Preview is readable and states the before/after.
    expect(screen.getByText('AI 建議調整')).toBeTruthy();
    expect(screen.getByText('這些調整還沒有寫進正式行程。')).toBeTruthy();
    expect(document.body.textContent).toContain('原因：配合「每天11點後出門」');

    // Nothing has been written.
    expect(describeItinerary(persistedItinerary())).toEqual(describeItinerary(busanItinerary));
    log('AFTER_PREVIEW_persisted_unchanged', describeItinerary(persistedItinerary()));

    // 取消 discards the diff and still writes nothing. Scoped to the diff card,
    // since the flight-anchor form on this screen has a 取消 of its own.
    const diffActions = screen.getByText('套用這些調整').parentElement!;
    await user.click(within(diffActions).getByText('取消'));
    expect(screen.queryByText('套用這些調整')).toBeNull();
    expect(describeItinerary(persistedItinerary())).toEqual(describeItinerary(busanItinerary));
    log('AFTER_CANCEL_persisted_unchanged', describeItinerary(persistedItinerary()));
  });

  it('REORDER: applies moves by item id, deletes nothing, and survives a reload', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await generateWith(user, '重新安排路線', {
      summary: '調順動線。',
      changes: [
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30', reason: '配合「每天11點後出門」' },
        { type: 'move', existingItemId: 'it-gukje', toDate: TRIP_MID, toTime: '10:00', reason: '和海雲台分開' },
        // A removal the mode forbids; it must never reach the itinerary.
        { type: 'remove', existingItemId: 'it-haeundae', reason: '太遠' },
      ],
    });

    expect(document.body.textContent).not.toContain('－ 移除');
    await user.click(screen.getByText('套用這些調整'));
    await waitFor(() => expect(persistedItinerary().find(entry => entry.id === 'it-gamcheon')?.time).toBe('11:30'));

    const applied = persistedItinerary();
    log('REORDER_persisted', describeItinerary(applied));
    expect(persistedDraftId()).toBe(DRAFT_ID);
    // Every original id still present: a reorder never deletes.
    expect(applied.map(entry => entry.id).sort()).toEqual(['it-gamcheon', 'it-gukje', 'it-haeundae']);
    expect(applied.find(entry => entry.id === 'it-gamcheon')).toMatchObject({ date: TRIP_START, time: '11:30' });
    expect(applied.find(entry => entry.id === 'it-gukje')).toMatchObject({ date: TRIP_MID, time: '10:00' });
    // The untouched item is byte-identical.
    expect(applied.find(entry => entry.id === 'it-haeundae')).toEqual(busanItinerary[1]);

    // Reload.
    cleanup();
    render(<App />);
    const user2 = userEvent.setup();
    await openPlanning(user2);
    log('REORDER_after_reload', describeItinerary(persistedItinerary()));
    expect(describeItinerary(persistedItinerary())).toEqual(describeItinerary(applied));
    expect(screen.getAllByText('甘川文化村').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('11:30');
  });

  it('ADD: adds only, never moving or removing an existing item, and preserves provenance', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    // Select the saved SPA LAND so the add can legitimately claim its identity.
    await user.click(screen.getByRole('checkbox', { name: /SPA LAND/ }));

    await generateWith(user, '補充行程', {
      summary: '下午補一家咖啡廳與汗蒸幕。',
      changes: [
        { type: 'add', toDate: TRIP_MID, proposedItem: { placeName: '黑房咖啡', suggestedStartTime: '14:00', note: '在國際市場附近', sourceInspirationIds: [] }, reason: '你想找咖啡廳' },
        { type: 'add', toDate: TRIP_MID, proposedItem: { placeName: 'SPA LAND Centum City', suggestedStartTime: '16:00', sourceInspirationIds: ['insp-spa'] }, reason: '你希望安排汗蒸幕' },
        // Forbidden in this mode.
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
        { type: 'remove', existingItemId: 'it-gukje' },
      ],
    });

    expect(requests.at(-1)!.adjustmentMode).toBe('add');
    expect(document.body.textContent).not.toContain('－ 移除');
    expect(document.body.textContent).toContain('只會新增');

    await user.click(screen.getByText('套用這些調整'));
    await waitFor(() => expect(persistedItinerary()).toHaveLength(5));

    const applied = persistedItinerary();
    log('ADD_persisted', describeItinerary(applied));
    expect(applied).toHaveLength(5);
    // Existing items are untouched, byte for byte.
    expect(applied.find(entry => entry.id === 'it-gamcheon')).toEqual(busanItinerary[0]);
    expect(applied.find(entry => entry.id === 'it-haeundae')).toEqual(busanItinerary[1]);
    expect(applied.find(entry => entry.id === 'it-gukje')).toEqual(busanItinerary[2]);

    const cafe = applied.find(entry => entry.title === '黑房咖啡');
    expect(cafe).toMatchObject({ date: TRIP_MID, time: '14:00', origin: 'ai_suggestion' });
    // Place resolution was refused, so it stays text-only rather than failing.
    expect(cafe?.placeId).toBeUndefined();
    expect(cafe?.sourceInspirationIds).toBeUndefined();

    const spa = applied.find(entry => entry.title === 'SPA LAND Centum City');
    expect(spa).toMatchObject({ date: TRIP_MID, time: '16:00', placeId: 'place-spa', origin: 'saved_inspiration' });
    expect(spa?.sourceInspirationIds).toEqual(['insp-spa']);

    // Reload.
    cleanup();
    render(<App />);
    await openPlanning(userEvent.setup());
    log('ADD_after_reload', describeItinerary(persistedItinerary()));
    expect(persistedItinerary()).toHaveLength(5);
  });

  it('REPLAN: removals are visible before they happen and applied by id', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await generateWith(user, '重新規劃', {
      summary: '重新安排三天動線。',
      changes: [
        { type: 'add', toDate: TRIP_END, proposedItem: { placeName: '松島天空步道', suggestedStartTime: '10:00', sourceInspirationIds: [] }, reason: '第三天還空著' },
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30', reason: '配合晚出門' },
        { type: 'update', existingItemId: 'it-haeundae', durationMinutes: 120, note: '傍晚看海', reason: '留久一點' },
        { type: 'remove', existingItemId: 'it-gukje', reason: '動線太繞' },
      ],
    });

    // Section 8: the removal is explicit, named, and carries its reason.
    expect(document.body.textContent).toContain('－ 移除：國際市場');
    expect(document.body.textContent).toContain('原因：動線太繞');
    // Still not applied.
    expect(persistedItinerary()).toHaveLength(3);

    await user.click(screen.getByText('套用這些調整'));
    await waitFor(() => expect(persistedItinerary().find(entry => entry.id === 'it-gukje')).toBeUndefined());

    const applied = persistedItinerary();
    log('REPLAN_persisted', describeItinerary(applied));
    expect(applied.map(entry => entry.id).filter(id => id.startsWith('it-')).sort()).toEqual(['it-gamcheon', 'it-haeundae']);
    expect(applied.find(entry => entry.id === 'it-gukje')).toBeUndefined();
    expect(applied.find(entry => entry.id === 'it-gamcheon')?.time).toBe('11:30');
    expect(applied.find(entry => entry.id === 'it-haeundae')).toMatchObject({ durationMinutes: 120, notes: '傍晚看海' });
    expect(applied.find(entry => entry.title === '松島天空步道')).toMatchObject({ date: TRIP_END, time: '10:00' });

    cleanup();
    render(<App />);
    await openPlanning(userEvent.setup());
    log('REPLAN_after_reload', describeItinerary(persistedItinerary()));
    expect(describeItinerary(persistedItinerary())).toEqual(describeItinerary(applied));
  });

  it('a failed generation leaves the itinerary, the mode and the typed text alone', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    await user.click(screen.getByRole('radio', { name: /重新安排路線/ }));
    await user.type(screen.getByLabelText(/告訴 AI 你想怎麼調整/), '每天11點才出門');

    shouldFailRequest = true;
    await user.click(screen.getByText('AI 幫我調整行程'));
    await waitFor(() => expect(document.body.textContent).toContain('AI 行程調整服務暫時無法使用'));

    log('FAILURE_persisted', describeItinerary(persistedItinerary()));
    expect(describeItinerary(persistedItinerary())).toEqual(describeItinerary(busanItinerary));
    // Mode still selected, text still there, nothing to re-do by hand.
    expect(screen.getByRole('radio', { name: /重新安排路線/ }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText(/告訴 AI 你想怎麼調整/) as HTMLTextAreaElement).value).toBe('每天11點才出門');

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });
});
