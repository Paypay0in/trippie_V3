import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlaceCommerceCache,
  commerceCacheKey,
  fetchPlaceCommerce,
  hasDisplayableCommerce,
  normalizePlaceCommerce,
} from './placeCommerceService';

const SPA_LAND = {
  admissionRequired: true,
  officialPrice: { amount: 26000, currency: 'KRW', label: '平日全票', sourceName: '官方網站', sourceUrl: 'https://operator.example/tickets', checkedAt: '2026-09-14' },
  bookingOptions: [
    { provider: 'klook', label: 'Klook', url: 'https://www.klook.com/activity/12345/', urlType: 'direct' },
    { provider: 'kkday', label: 'KKday', url: 'https://www.kkday.com/zh-tw/product/ls?keyword=SPA%20LAND', urlType: 'search' },
  ],
  notes: ['未滿 19 歲不可入場'],
  lastCheckedAt: '2026-09-14',
};

beforeEach(() => clearPlaceCommerceCache());
afterEach(() => vi.unstubAllGlobals());

describe('commerceCacheKey', () => {
  it('prefers canonical place identity over the display name', () => {
    expect(commerceCacheKey({ placeId: 'ChIJ-spa', placeName: 'SPA LAND', city: '釜山' })).toBe('place:ChIJ-spa');
    // Two places sharing a name in different cities must not share a cache entry.
    expect(commerceCacheKey({ placeName: '國際市場', city: '釜山', country: '韓國' }))
      .not.toBe(commerceCacheKey({ placeName: '國際市場', city: '首爾', country: '韓國' }));
  });
});

describe('normalizePlaceCommerce — price honesty', () => {
  it('keeps a well-formed verified price', () => {
    expect(normalizePlaceCommerce(SPA_LAND)?.officialPrice).toEqual({
      amount: 26000, currency: 'KRW', label: '平日全票',
      sourceName: '官方網站', sourceUrl: 'https://operator.example/tickets', checkedAt: '2026-09-14',
    });
  });

  it('drops a price that is not a real amount, rather than showing a number', () => {
    const valid = { sourceName: '官方網站', sourceUrl: 'https://operator.example/tickets', checkedAt: '2026-09-14' };
    const cases = [
      { amount: 'about 26000', currency: 'KRW', ...valid },
      { amount: 0, currency: 'KRW', ...valid },
      { amount: -100, currency: 'KRW', ...valid },
      { amount: Number.NaN, currency: 'KRW', ...valid },
      { amount: 26000, currency: '', ...valid },
      { amount: 26000, ...valid },
      // A real number missing any part of its provenance is still not showable.
      { amount: 26000, currency: 'KRW', sourceUrl: 'https://operator.example/tickets', checkedAt: '2026-09-14' },
      { amount: 26000, currency: 'KRW', sourceName: '官方網站', checkedAt: '2026-09-14' },
      { amount: 26000, currency: 'KRW', sourceName: '官方網站', sourceUrl: 'https://operator.example/tickets' },
      { amount: 26000, currency: 'KRW', sourceName: '  ', sourceUrl: 'https://operator.example/tickets', checkedAt: '2026-09-14' },
      { amount: 26000, currency: 'KRW', sourceName: '官方網站', sourceUrl: 'not-a-url', checkedAt: '2026-09-14' },
      { amount: 26000, currency: 'KRW', sourceName: '官方網站', sourceUrl: 'https://operator.example/tickets', checkedAt: '2026/09/14' },
    ];
    cases.forEach(officialPrice => {
      const info = normalizePlaceCommerce({ admissionRequired: true, officialPrice });
      expect(info?.officialPrice, JSON.stringify(officialPrice)).toBeUndefined();
      // The place is still ticketed; only the price is missing, so the card can
      // still offer 查看最新票價 rather than hiding the section entirely.
      expect(info?.admissionRequired).toBe(true);
    });
  });

  it('never invents a price from nothing', () => {
    expect(normalizePlaceCommerce({ admissionRequired: true })?.officialPrice).toBeUndefined();
  });
});

describe('normalizePlaceCommerce — provider links', () => {
  it('keeps only options with a valid https URL, a label and a declared urlType', () => {
    const info = normalizePlaceCommerce({
      admissionRequired: true,
      bookingOptions: [
        { provider: 'official', label: '官方網站', url: 'https://example.com/tickets', urlType: 'direct' },
        { provider: 'klook', label: 'Klook', url: '', urlType: 'direct' },
        { provider: 'kkday', label: 'KKday', urlType: 'direct' },
        { provider: 'fake', label: 'Fake', url: 'not-a-url', urlType: 'direct' },
        { provider: 'js', label: 'XSS', url: 'javascript:alert(1)', urlType: 'direct' },
        { provider: 'nolabel', label: '   ', url: 'https://example.com', urlType: 'direct' },
        // No urlType: cannot be labelled honestly, so it is not rendered.
        { provider: 'official', label: '官方網站', url: 'https://example.com/other' },
        // Provider on the wrong domain: the client re-checks, not just the server.
        { provider: 'klook', label: 'Klook', url: 'https://evil.example/klook', urlType: 'direct' },
      ],
    });
    expect(info?.bookingOptions).toEqual([
      { provider: 'official', label: '官方網站', url: 'https://example.com/tickets', urlType: 'direct' },
    ]);
  });

  it('carries urlType through so the UI can label direct and search differently', () => {
    const info = normalizePlaceCommerce(SPA_LAND);
    expect(info?.bookingOptions?.map(option => option.urlType)).toEqual(['direct', 'search']);
  });

  it('omits bookingOptions entirely when none survive', () => {
    const info = normalizePlaceCommerce({ admissionRequired: true, bookingOptions: [{ provider: 'klook', label: 'Klook', url: 'ftp://x', urlType: 'direct' }] });
    expect(info?.bookingOptions).toBeUndefined();
  });
});

describe('hasDisplayableCommerce', () => {
  it('shows the section for a ticketed place', () => {
    expect(hasDisplayableCommerce(normalizePlaceCommerce(SPA_LAND))).toBe(true);
    // Ticketed but price unknown still earns the section: 查看最新票價 is useful.
    expect(hasDisplayableCommerce({ admissionRequired: true })).toBe(true);
  });

  it('renders nothing for a place that needs no admission', () => {
    // 海雲台海水浴場 — a free beach must not get an empty 門票 section.
    expect(hasDisplayableCommerce({ admissionRequired: false })).toBe(false);
    expect(hasDisplayableCommerce({ admissionRequired: false, lastCheckedAt: '2026-09-14' })).toBe(false);
  });

  it('renders nothing when the lookup said nothing useful', () => {
    expect(hasDisplayableCommerce(null)).toBe(false);
    expect(hasDisplayableCommerce(undefined)).toBe(false);
    expect(hasDisplayableCommerce({})).toBe(false);
    expect(hasDisplayableCommerce({ lastCheckedAt: '2026-09-14' })).toBe(false);
  });
});

describe('fetchPlaceCommerce — failure safety', () => {
  const stubFetch = (impl: () => Promise<unknown>) => {
    const spy = vi.fn((_url: string, _init?: RequestInit) => impl());
    vi.stubGlobal('fetch', spy);
    return spy;
  };

  it('returns the normalized info on success', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ commerce: SPA_LAND }) }));
    const info = await fetchPlaceCommerce({ placeId: 'ChIJ-spa', placeName: 'SPA LAND Centum City', city: '釜山' });
    expect(info?.officialPrice?.amount).toBe(26000);
  });

  it('resolves to null when the request rejects', async () => {
    stubFetch(async () => { throw new Error('network down'); });
    await expect(fetchPlaceCommerce({ placeName: 'SPA LAND' })).resolves.toBeNull();
  });

  it('resolves to null on a non-ok response or malformed body', async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({ error: 'boom' }) }));
    await expect(fetchPlaceCommerce({ placeName: 'A' })).resolves.toBeNull();

    clearPlaceCommerceCache();
    stubFetch(async () => ({ ok: true, json: async () => 'not an object' }));
    await expect(fetchPlaceCommerce({ placeName: 'B' })).resolves.toBeNull();
  });

  it('asks once per place and reuses the answer', async () => {
    const spy = stubFetch(async () => ({ ok: true, json: async () => ({ commerce: SPA_LAND }) }));
    const query = { placeId: 'ChIJ-spa', placeName: 'SPA LAND Centum City' };
    await Promise.all([fetchPlaceCommerce(query), fetchPlaceCommerce(query)]);
    await fetchPlaceCommerce(query);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not call out at all without a place to look up', async () => {
    const spy = stubFetch(async () => ({ ok: true, json: async () => ({ commerce: SPA_LAND }) }));
    await expect(fetchPlaceCommerce({ placeName: '   ' })).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends canonical identity and trip context, and never anything else', async () => {
    const spy = stubFetch(async () => ({ ok: true, json: async () => ({ commerce: SPA_LAND }) }));
    await fetchPlaceCommerce({ placeId: 'ChIJ-spa', placeName: 'SPA LAND Centum City', city: '釜山', country: '韓國' });
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body).toEqual({ placeId: 'ChIJ-spa', placeName: 'SPA LAND Centum City', city: '釜山', country: '韓國' });
  });
});
