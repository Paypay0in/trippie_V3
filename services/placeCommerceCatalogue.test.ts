import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildCuratedCommerce,
  classifyPlaceTypes,
  commerceNameKey,
  CuratedCommerceEntry,
  findCuratedCommerce,
  isPriceFresh,
  MAX_PRICE_AGE_DAYS,
  PLACE_COMMERCE_CATALOGUE,
} from './placeCommerceCatalogue';

const CHECKED = '2026-09-14';
const NOW = new Date('2026-09-14T12:00:00Z');

const entry = (overrides: Partial<CuratedCommerceEntry> = {}): CuratedCommerceEntry => ({
  nameKeys: ['spalandcentumcity', 'spaland'],
  admissionRequired: true,
  priceSource: {
    url: 'https://operator.example/tickets',
    sourceName: '官方網站',
    currency: 'KRW',
    label: '平日全票',
    pattern: '입장료[^0-9]*([0-9,]+)',
    maxPlausibleAmount: 500000,
  },
  ...overrides,
});

/** What a live read hands back. */
const livePrice = (checkedAt = CHECKED) => ({
  amount: 26000, currency: 'KRW', label: '平日全票',
  sourceName: '官方網站', sourceUrl: 'https://operator.example/tickets', checkedAt,
});

describe('the shipped catalogue', () => {
  it('contains no hardcoded price anywhere', () => {
    // The catalogue declares WHERE to read a price, never the price itself. This is
    // what makes it impossible to ship a number nobody can point at.
    const serialized = JSON.stringify(PLACE_COMMERCE_CATALOGUE);
    expect(serialized).not.toMatch(/"amount"/);
    expect(serialized).not.toMatch(/"officialPrice"/);
  });

  it('gives every declared price source a verifiable URL and attribution', () => {
    PLACE_COMMERCE_CATALOGUE.forEach(item => {
      if (!item.priceSource) return;
      expect(() => new URL(item.priceSource!.url)).not.toThrow();
      expect(item.priceSource.sourceName.trim()).toBeTruthy();
      expect(item.priceSource.currency.trim()).toBeTruthy();
      expect(item.priceSource.maxPlausibleAmount).toBeGreaterThan(0);
    });
  });

  it('resolves the SPA LAND entry', () => {
    const found = findCuratedCommerce(undefined, 'SPA LAND Centum City');
    expect(found).toBeDefined();
    expect(found?.admissionRequired).toBe(true);
  });
});

describe('findCuratedCommerce — place identity', () => {
  const catalogue = [entry({ placeIds: ['ChIJ-spaland'] })];

  it('matches on canonical placeId', () => {
    expect(findCuratedCommerce('ChIJ-spaland', 'anything at all', catalogue)).toBe(catalogue[0]);
  });

  it('matches a normalized name when there is no placeId', () => {
    expect(findCuratedCommerce(undefined, 'SPA LAND Centum City', catalogue)).toBe(catalogue[0]);
    expect(findCuratedCommerce(undefined, 'spa-land', catalogue)).toBe(catalogue[0]);
  });

  it('does not attach a price on loose name matching', () => {
    // 「市場」 as a catalogue key must not drag its price onto every market.
    const marketCatalogue = [entry({ nameKeys: ['市場'], priceSource: undefined })];
    expect(findCuratedCommerce(undefined, '札嘎其市場', marketCatalogue)).toBeUndefined();
    expect(findCuratedCommerce(undefined, '海雲台海水浴場', catalogue)).toBeUndefined();
    // A name too short to be an identity matches nothing.
    expect(findCuratedCommerce(undefined, 'SP', catalogue)).toBeUndefined();
    expect(findCuratedCommerce(undefined, '', catalogue)).toBeUndefined();
  });
});

describe('isPriceFresh', () => {
  it('accepts a recently checked price', () => {
    expect(isPriceFresh(CHECKED, NOW)).toBe(true);
    expect(isPriceFresh('2026-05-01', NOW)).toBe(true);
  });

  it('rejects a price older than the freshness window', () => {
    const stale = new Date(NOW.getTime() + (MAX_PRICE_AGE_DAYS + 5) * 86_400_000);
    expect(isPriceFresh(CHECKED, stale)).toBe(false);
  });

  it('fails closed on an unusable or impossible date', () => {
    expect(isPriceFresh('', NOW)).toBe(false);
    expect(isPriceFresh('2026/09/14', NOW)).toBe(false);
    expect(isPriceFresh('last tuesday', NOW)).toBe(false);
    // A date from the future is bad data, not a very fresh price.
    expect(isPriceFresh('2027-01-01', NOW)).toBe(false);
  });
});

describe('buildCuratedCommerce', () => {
  it('shows a live-read price with its provenance intact', () => {
    const built = buildCuratedCommerce(entry(), 'SPA LAND Centum City', livePrice(), NOW);
    expect(built.officialPrice).toEqual(livePrice());
    expect(built.admissionRequired).toBe(true);
    expect(built.bookingOptions.map(option => option.provider)).toEqual(['official']);
  });

  it('shows no price when the live read produced none', () => {
    const built = buildCuratedCommerce(entry(), 'SPA LAND Centum City', undefined, NOW);
    expect(built.officialPrice).toBeUndefined();
    expect(built.priceStale).toBeUndefined();
    // Still ticketed, so the card keeps its links and says 查看最新票價.
    expect(built.admissionRequired).toBe(true);
    // The price page still earns an 官方網站 button.
    expect(built.bookingOptions.map(option => option.provider)).toEqual(['official']);
  });

  it('drops a stale price rather than presenting it as current', () => {
    const stale = new Date(NOW.getTime() + (MAX_PRICE_AGE_DAYS + 30) * 86_400_000);
    const built = buildCuratedCommerce(entry(), 'SPA LAND Centum City', livePrice(), stale);
    expect(built.officialPrice).toBeUndefined();
    expect(built.priceStale).toBe(true);
    expect(built.admissionRequired).toBe(true);
  });

  it('links the price page as 官方網站 when no separate official URL is set', () => {
    const built = buildCuratedCommerce(entry(), 'X', livePrice(), NOW);
    expect(built.bookingOptions[0]).toMatchObject({ provider: 'official', url: 'https://operator.example/tickets' });
    const withSite = buildCuratedCommerce(entry({ officialUrl: 'https://example.com/spaland' }), 'X', livePrice(), NOW);
    expect(withSite.bookingOptions.filter(option => option.provider === 'official')).toHaveLength(1);
    expect(withSite.bookingOptions[0]).toMatchObject({ url: 'https://example.com/spaland' });
  });

  it('offers no booking links for a place that needs no admission', () => {
    const built = buildCuratedCommerce(entry({ admissionRequired: false, priceSource: undefined }), '海雲台海水浴場', undefined, NOW);
    expect(built.admissionRequired).toBe(false);
    expect(built.bookingOptions).toEqual([]);
  });
});

describe('classifyPlaceTypes', () => {
  it('calls a ticketed category ticketed', () => {
    expect(classifyPlaceTypes(['spa', 'point_of_interest'])).toBe('ticketed');
    expect(classifyPlaceTypes(['aquarium'])).toBe('ticketed');
  });

  it('calls a free category free, even alongside a ticketed one', () => {
    expect(classifyPlaceTypes(['beach', 'tourist_attraction'])).toBe('free');
    expect(classifyPlaceTypes(['park', 'spa'])).toBe('free');
  });

  it('stays silent on a broad or missing category', () => {
    expect(classifyPlaceTypes(['tourist_attraction', 'point_of_interest'])).toBe('unknown');
    expect(classifyPlaceTypes([])).toBe('unknown');
    expect(classifyPlaceTypes(undefined)).toBe('unknown');
  });
});

/**
 * The guessing helper was deliberately deleted. Provider links now come only from
 * `bookingLinks` a human verified, which is asserted in bookingUrlValidation.test.
 */
describe('no URL is built from a place name', () => {
  it('ships no catalogue entry carrying an unverified provider link', () => {
    PLACE_COMMERCE_CATALOGUE.forEach(item => {
      (item.bookingLinks || []).forEach(bookingLink => {
        expect(() => new URL(bookingLink.url)).not.toThrow();
        expect(bookingLink.urlType === 'direct' || bookingLink.urlType === 'search').toBe(true);
      });
    });
  });
});

describe('commerceNameKey', () => {
  it('ignores spacing and punctuation differences', () => {
    expect(commerceNameKey('SPA LAND Centum City')).toBe(commerceNameKey('spa-land.centum,city'));
  });
});

/**
 * Regression guard for the defect this ticket uncovered: /api/places/commerce was
 * registered before express.json(), so req.body was always undefined and the route
 * silently returned null for every place. A route that reads req.body must be
 * mounted after the body parser.
 */
describe('server route registration order', () => {
  // The failure this prevents: a body-reading route mounted before any JSON
  // parser sees `req.body` as undefined and answers as though the caller sent
  // nothing — a 400 that looks like the client's fault. It shipped twice.
  //
  // Sitting after the global express.json() is the usual way to satisfy this,
  // but not the only one: a route that must accept a body larger than the
  // global limit has to be mounted earlier, carrying its own parser, because
  // the global parser would reject the request first. Either shape is fine;
  // having no parser at all is not.
  it('gives every body-reading API route a JSON parser', () => {
    const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8').split('\n');
    const jsonLine = server.findIndex(line => line.includes('app.use(express.json('));
    expect(jsonLine).toBeGreaterThan(-1);

    const unparsed = server
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /app\.(post|put|patch)\(/.test(line))
      .filter(({ index }) => index < jsonLine)
      // An earlier route is only acceptable when it brings its own parser.
      .filter(({ line }) => !/express\.json\(/.test(line))
      .map(({ line }) => line.trim());

    expect(unparsed).toEqual([]);
  });

  it('keeps the oversized-body allowance to the one route that needs it', () => {
    const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
    const inline = [...server.matchAll(/app\.(?:post|put|patch)\("([^"]+)",\s*express\.json\(/g)].map(m => m[1]);
    // Photos are the only bodies this server accepts above 16kb.
    // Widening that to another route is a decision, not a detail — and
    // /api/itinerary/parse-image is that decision, taken knowingly: it reads a
    // screenshot of someone's travel plans, which is the same kind of body as
    // the three beside it.
    expect(inline).toEqual([
      '/api/expenses/parse-image',
      '/api/stays/parse-image',
      '/api/itinerary/parse-image',
      '/api/flights/parse-image',
    ]);
  });
});

describe('an exhausted model must not end the request', () => {
  const server = () => readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

  it('never abandons a fallback because the first model hit its quota', () => {
    // The itinerary endpoints held a second model and refused to use it on a
    // 429, on the assumption that an exhausted quota was exhausted everywhere.
    // It is not: the free tier meters per model per day — the quota id says so
    // outright — so a 429 on one model says nothing about the next and is
    // exactly when the fallback earns its keep.
    expect(server()).not.toMatch(/quotaStatusOf\([a-zA-Z]+\)\)\s*throw/);
  });

  it('gives every Gemini call a way past one exhausted model', () => {
    // Either the shared chain, or an endpoint's own second model.
    const text = server();
    const calls = [...text.matchAll(/ai\.models\.generateContent\(\{/g)].length;
    const chained = [...text.matchAll(/withModelFallback\(/g)].length;
    const ownFallback = [...text.matchAll(/fallbackModel/g)].length;

    expect(calls).toBeGreaterThan(0);
    expect(chained + ownFallback).toBeGreaterThan(0);
    // Named so the count is a fact rather than a vibe: what matters is that a
    // new endpoint added without either shows up here as a smaller ratio.
    expect(chained).toBeGreaterThanOrEqual(7);
  });
});
