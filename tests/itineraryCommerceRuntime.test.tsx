/**
 * @vitest-environment jsdom
 *
 * Runtime proof for commerce enrichment v1: a ticketed place shows 門票 / 預約 on
 * the normal itinerary card, a free place shows nothing, a failed lookup changes
 * nothing, and none of it touches provenance or persisted itinerary data.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ItineraryItem } from '../types';
import { clearPlaceCommerceCache } from '../services/placeCommerceService';

const TRIP_DAY = '2026-10-06';
const DRAFT_ID = 'draft-commerce';

/** SPA LAND is ticketed; the beach is free. Both are on the same day. */
const itinerary: ItineraryItem[] = [
  {
    id: 'it-spaland', date: TRIP_DAY, time: '11:00',
    title: 'SPA LAND Centum City', location: 'SPA LAND Centum City',
    notes: '', type: 'ACTIVITY',
    placeId: 'ChIJ-spaland',
    address: '35 Centum-namdae-ro, Haeundae-gu, Busan',
    origin: 'ai_suggestion',
  },
  {
    id: 'it-beach', date: TRIP_DAY, time: '16:00',
    title: '海雲台海水浴場', location: '海雲台海水浴場',
    notes: '', type: 'ACTIVITY',
    placeId: 'ChIJ-beach',
    origin: 'saved_inspiration',
    sourceInspirationIds: ['insp-beach'],
    savedTravelNotes: [{ id: 'n1', sourceNoteId: 'sn1', sourceSliceId: 'ss1', sourcePostId: 'post-1', sourceCreatorId: 'creator-1', type: 'recommendation', text: '傍晚人比較少' }],
  },
];

const SPA_LAND_COMMERCE = {
  admissionRequired: true,
  officialPrice: { amount: 26000, currency: 'KRW', label: '平日全票', sourceName: '官方網站', sourceUrl: 'https://example.com/spaland', checkedAt: '2026-09-14' },
  bookingOptions: [
    { provider: 'official', label: '官方網站', url: 'https://example.com/spaland', urlType: 'direct' },
    { provider: 'klook', label: 'Klook', url: 'https://www.klook.com/activity/12345/', urlType: 'direct' },
    { provider: 'kkday', label: 'KKday', url: 'https://www.kkday.com/zh-tw/product/ls?keyword=SPA+LAND', urlType: 'search' },
  ],
  notes: ['未滿 19 歲不可入場'],
  lastCheckedAt: '2026-09-14',
};

/** Swapped per test to exercise the price-unknown and failure paths. */
let commerceFor: (placeId: string) => unknown = () => null;
let commerceFails = false;

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
    itinerary,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  localStorage.setItem('trippie_active_trip_id', DRAFT_ID);
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
  clearPlaceCommerceCache();
  commerceFails = false;
  commerceFor = (placeId: string) => (placeId === 'ChIJ-spaland' ? SPA_LAND_COMMERCE : { admissionRequired: false });
  seedStorage();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    const body = JSON.parse(String(init?.body || '{}'));
    if (target.includes('/api/places/commerce')) {
      if (commerceFails) throw new Error('commerce lookup exploded');
      return { ok: true, status: 200, json: async () => ({ commerce: commerceFor(String(body.placeId || '')) }) } as unknown as Response;
    }
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
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
};

const timeline = () => within(screen.getByLabelText('行程時間軸'));

/**
 * The commerce block itself. The 門票 / 預約 label sits in its own header row, so
 * the section is that row's parent.
 */
const commerceSection = () => timeline().getByText('門票 / 預約').closest('div')!.parentElement!;

describe('itinerary commerce enrichment runtime', () => {
  it('shows 門票 / 預約 for the ticketed place and nothing for the free one', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    // Exactly one commerce section on a day holding one ticketed and one free place.
    expect(timeline().getAllByText('門票 / 預約')).toHaveLength(1);
    log('SECTIONS_on_day', 1);

    const section = commerceSection();
    expect(within(section).getByText(/官方參考價・平日全票 · 更新於 2026\/09\/14/)).toBeTruthy();
    // Intl renders KRW with the fullwidth won sign.
    expect(within(section).getByText('￦26,000')).toBeTruthy();
    expect(within(section).getByText('未滿 19 歲不可入場')).toBeTruthy();
    // Two links legitimately carry this name: the booking button and the price
    // attribution. Both must point at the page the amount was read from.
    const officialLinks = within(section).getAllByRole('link', { name: /官方網站/ });
    expect(officialLinks).toHaveLength(2);
    officialLinks.forEach(link => expect(link.getAttribute('href')).toBe('https://example.com/spaland'));
    expect(section.textContent).toContain('參考價來源：');
    log('PRICE_rendered', '￦26,000');

    // Provider buttons link where the contract said, and nowhere else.
    // The 購票 / 查價 row only; the attribution link below it is asserted separately.
    const bookingRow = within(section).getByText('購票 / 查價').nextElementSibling as HTMLElement;
    const links = within(bookingRow).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')]);
    log('PROVIDER_LINKS', links);
    // A direct link promises a price; a search link promises only a search.
    expect(links).toEqual([
      ['官方網站查看價格', 'https://example.com/spaland'],
      ['Klook查看價格', 'https://www.klook.com/activity/12345/'],
      ['KKday搜尋', 'https://www.kkday.com/zh-tw/product/ls?keyword=SPA+LAND'],
    ]);
    within(section).getAllByRole('link').forEach(link => {
      expect(link.getAttribute('rel')).toContain('noopener');
    });

    // The free beach keeps its normal card — notes intact, no empty section.
    expect(timeline().getByText('傍晚人比較少')).toBeTruthy();
    expect(timeline().queryByText('查看最新票價')).toBeNull();
  });

  it('says 查看最新票價 rather than inventing a price', async () => {
    // Ticketed, but no verified price exists for it.
    commerceFor = (placeId) => (placeId === 'ChIJ-spaland'
      ? { admissionRequired: true, bookingOptions: [{ provider: 'klook', label: 'Klook', url: 'https://www.klook.com/activity/1/', urlType: 'direct' }], lastCheckedAt: '2026-09-14' }
      : { admissionRequired: false });

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const section = commerceSection();
    expect(within(section).getByText('查看最新票價')).toBeTruthy();
    expect(within(section).queryByText(/官方參考價/)).toBeNull();
    // No currency figure anywhere in the section. (The 2026 in the
    // lastCheckedAt line is a date, not a price.)
    expect(section.textContent).not.toMatch(/[￦₩$€£]|\bKRW\b/);
    log('NO_PRICE_fallback', '查看最新票價');
  });

  it('drops a provider button whose URL is not usable', async () => {
    commerceFor = (placeId) => (placeId === 'ChIJ-spaland'
      ? {
          admissionRequired: true,
          bookingOptions: [
            { provider: 'official', label: '官方網站', url: 'https://example.com/ok', urlType: 'direct' },
            { provider: 'klook', label: 'Klook', url: '', urlType: 'direct' },
            { provider: 'kkday', label: 'KKday', url: 'not-a-url', urlType: 'direct' },
            // Right provider name, wrong domain — the client rejects it too.
            { provider: 'klook', label: 'Klook', url: 'https://evil.example/klook', urlType: 'direct' },
          ],
        }
      : { admissionRequired: false });

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    const section = commerceSection();
    const links = within(section).getAllByRole('link').map(link => link.textContent);
    log('LINKS_after_filtering', links);
    expect(links).toEqual(['官方網站查看價格']);
  });

  it('renders the itinerary normally when the commerce lookup fails', async () => {
    commerceFails = true;

    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);

    // No section, no error, and the itinerary itself is untouched.
    expect(timeline().queryByText('門票 / 預約')).toBeNull();
    expect(timeline().getAllByText('SPA LAND Centum City').length).toBeGreaterThan(0);
    expect(timeline().getAllByText('海雲台海水浴場').length).toBeGreaterThan(0);
    expect(timeline().getByText('傍晚人比較少')).toBeTruthy();
    log('FAILURE_card_still_renders', true);
  });

  it('never writes commerce data into the persisted itinerary or changes provenance', async () => {
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    await waitFor(() => expect(timeline().getByText('門票 / 預約')).toBeTruthy());

    const persisted = persistedItinerary();
    log('PERSISTED_after_lookup', persisted.map(entry => `${entry.title} origin=${entry.origin} keys=${Object.keys(entry).length}`));

    // Byte-identical to what was seeded: commerce is display-only.
    expect(persisted).toEqual(itinerary);
    expect(JSON.stringify(persisted)).not.toContain('26000');
    expect(JSON.stringify(persisted)).not.toContain('klook');

    const spaland = persisted.find(entry => entry.id === 'it-spaland')!;
    expect(spaland.origin).toBe('ai_suggestion');
    expect(spaland.sourceInspirationIds).toBeUndefined();
    const beach = persisted.find(entry => entry.id === 'it-beach')!;
    expect(beach.origin).toBe('saved_inspiration');
    expect(beach.sourceInspirationIds).toEqual(['insp-beach']);

    // Reload: still clean, still rendering.
    cleanup();
    render(<App />);
    await openPlanning(userEvent.setup());
    expect(persistedItinerary()).toEqual(itinerary);
    log('AFTER_RELOAD_persisted_unchanged', true);

    // eslint-disable-next-line no-console
    console.log(trace.join('\n'));
  });
});

/**
 * Price-lookup specifics for the Commerce Price Data Lookup ticket: a verified
 * price renders with its provenance, and anything short of that renders no number.
 */
describe('commerce price lookup runtime', () => {
  const priceTest = async (commerce: unknown) => {
    commerceFor = (placeId) => (placeId === 'ChIJ-spaland' ? commerce : { admissionRequired: false });
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    return commerceSection();
  };

  /** Any figure a user could read as a ticket price. */
  const expectNoNumericPrice = (section: HTMLElement) => {
    expect(within(section).getByText('查看最新票價')).toBeTruthy();
    expect(within(section).queryByText(/官方參考價/)).toBeNull();
    expect(section.textContent).not.toMatch(/[￦₩$€£]|\bKRW\b/);
    expect(section.textContent).not.toMatch(/\b0\b/);
    // Note: 約 alone is not usable here — the section header 「門票 / 預約」 contains it.
    expect(section.textContent).not.toMatch(/unknown|estimated|估計|大約/i);
  };

  it('renders a verified price with its source and check date', async () => {
    const section = await priceTest({
      admissionRequired: true,
      officialPrice: { amount: 26000, currency: 'KRW', label: '平日全票', sourceName: '官方網站', sourceUrl: 'https://example.com/spaland', checkedAt: '2026-09-14' },
      bookingOptions: [{ provider: 'klook', label: 'Klook', url: 'https://www.klook.com/activity/1/', urlType: 'direct' }],
    });
    expect(within(section).getByText('￦26,000')).toBeTruthy();
    expect(within(section).getByText(/更新於 2026\/09\/14/)).toBeTruthy();
    expect(section.textContent).toContain('參考價來源：');
    expect(within(section).getAllByRole('link').some(link => link.getAttribute('href') === 'https://example.com/spaland')).toBe(true);
  });

  it('shows no number when the price has no source', async () => {
    expectNoNumericPrice(await priceTest({
      admissionRequired: true,
      officialPrice: { amount: 26000, currency: 'KRW', sourceUrl: 'https://example.com/spaland', checkedAt: '2026-09-14' },
      bookingOptions: [{ provider: 'klook', label: 'Klook', url: 'https://www.klook.com/activity/1/', urlType: 'direct' }],
    }));
  });

  it('shows no number when the price has no check date', async () => {
    expectNoNumericPrice(await priceTest({
      admissionRequired: true,
      officialPrice: { amount: 26000, currency: 'KRW', sourceName: '官方網站', sourceUrl: 'https://example.com/spaland' },
    }));
  });

  it('never renders ₩0, unknown, or an estimate', async () => {
    expectNoNumericPrice(await priceTest({
      admissionRequired: true,
      officialPrice: { amount: 0, currency: 'KRW', sourceName: '官方網站', sourceUrl: 'https://example.com/spaland', checkedAt: '2026-09-14' },
    }));
  });

  it('does not present a stale price as current', async () => {
    // The server dropped the figure and said so; the card must not fill the gap.
    const section = await priceTest({ admissionRequired: true, priceStale: true, bookingOptions: [{ provider: 'kkday', label: 'KKday', url: 'https://www.kkday.com/zh-tw/product/ls?keyword=X', urlType: 'search' }] });
    expectNoNumericPrice(section);
    // Booking links survive so the user can still go and look.
    expect(within(section).getAllByRole('link')).toHaveLength(1);
  });

  it('cannot be made to show a price by a model-shaped payload', async () => {
    // Exactly what an AI-authored response would look like: a number, no provenance.
    expectNoNumericPrice(await priceTest({
      admissionRequired: true,
      officialPrice: { amount: 26000, currency: 'KRW', label: 'AI 估計' },
      notes: ['AI 推測票價約 ₩26,000'].slice(0, 0),
    }));
  });

  it('keeps the card intact when the whole lookup fails', async () => {
    commerceFails = true;
    const { default: App } = await import('../App');
    const user = userEvent.setup();
    render(<App />);
    await openPlanning(user);
    expect(timeline().queryByText('門票 / 預約')).toBeNull();
    expect(timeline().getAllByText('SPA LAND Centum City').length).toBeGreaterThan(0);
  });
});
