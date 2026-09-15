import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CuratedCommerceEntry } from './placeCommerceCatalogue';
import {
  extractPrice,
  fetchOfficialPrice,
  registerPlaceCommerceRoute,
  resolvePlaceCommerce,
} from './placeCommerceLookup';

/**
 * A stand-in operator page. Real HTML shape, served over real HTTP by the test,
 * so the extractor is exercised against bytes rather than a string literal.
 */
const OPERATOR_PAGE = `<!doctype html><html><body>
  <h1>스파랜드 이용안내</h1>
  <table><tr><th>구분</th><th>요금</th></tr>
  <tr><td>주중 입장료</td><td>26,000원</td></tr>
  <tr><td>주말 입장료</td><td>29,000원</td></tr></table>
</body></html>`;

const PRICE_SOURCE = {
  url: '', // filled in once the fixture server has a port
  sourceName: '官方網站',
  currency: 'KRW',
  label: '平日全票',
  pattern: '주중 입장료</td><td>([0-9,]+)',
  maxPlausibleAmount: 500_000,
};

let fixtureServer: Server;
let fixtureOrigin = '';

beforeAll(async () => {
  const app = express();
  app.get('/tickets', (_req, res) => res.type('html').send(OPERATOR_PAGE));
  app.get('/no-price', (_req, res) => res.type('html').send('<html><body>휴관일 안내</body></html>'));
  app.get('/boom', (_req, res) => res.status(500).send('nope'));
  await new Promise<void>(resolve => { fixtureServer = app.listen(0, resolve); });
  const address = fixtureServer.address();
  fixtureOrigin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  PRICE_SOURCE.url = `${fixtureOrigin}/tickets`;
});

afterAll(async () => {
  await new Promise<void>(resolve => fixtureServer.close(() => resolve()));
});

describe('extractPrice', () => {
  it('reads the amount the entry points at, not the first number on the page', () => {
    // The weekend price sits right next to it; the pattern decides which is meant.
    expect(extractPrice(OPERATOR_PAGE, PRICE_SOURCE)).toBe(26000);
  });

  it('returns nothing when the page no longer states the price', () => {
    expect(extractPrice('<html><body>휴관일 안내</body></html>', PRICE_SOURCE)).toBeUndefined();
  });

  it('refuses a capture that is not a plain number', () => {
    expect(extractPrice('주중 입장료</td><td>무료', PRICE_SOURCE)).toBeUndefined();
  });

  it('refuses an implausible figure rather than trusting markup noise', () => {
    expect(extractPrice('주중 입장료</td><td>999,999,999', PRICE_SOURCE)).toBeUndefined();
  });
});

describe('fetchOfficialPrice — real HTTP', () => {
  it('reads a live page and dates the price at fetch time', async () => {
    const price = await fetchOfficialPrice(PRICE_SOURCE, { now: new Date('2026-09-14T00:00:00Z') });
    expect(price).toEqual({
      amount: 26000,
      currency: 'KRW',
      label: '平日全票',
      sourceName: '官方網站',
      sourceUrl: PRICE_SOURCE.url,
      checkedAt: '2026-09-14',
    });
  });

  it('yields no price when the page states none', async () => {
    await expect(fetchOfficialPrice({ ...PRICE_SOURCE, url: `${fixtureOrigin}/no-price` })).resolves.toBeUndefined();
  });

  it('yields no price on an HTTP error', async () => {
    await expect(fetchOfficialPrice({ ...PRICE_SOURCE, url: `${fixtureOrigin}/boom` })).resolves.toBeUndefined();
  });

  it('yields no price when the host is unreachable', async () => {
    await expect(fetchOfficialPrice({ ...PRICE_SOURCE, url: 'http://127.0.0.1:1/tickets' })).resolves.toBeUndefined();
  });
});

describe('resolvePlaceCommerce', () => {
  const ticketed = (overrides: Partial<CuratedCommerceEntry> = {}): CuratedCommerceEntry[] => ([{
    nameKeys: ['spalandcentumcity'],
    admissionRequired: true,
    priceSource: PRICE_SOURCE,
    notes: ['未滿 19 歲不可入場'],
    ...overrides,
  }]);

  it('produces a full commerce payload for a curated place with a live price', async () => {
    const { commerce } = await resolvePlaceCommerce(
      { placeName: 'SPA LAND Centum City' },
      { catalogue: ticketed(), now: new Date('2026-09-14T00:00:00Z') },
    );
    expect(commerce).toMatchObject({
      admissionRequired: true,
      officialPrice: { amount: 26000, currency: 'KRW', sourceName: '官方網站', checkedAt: '2026-09-14' },
    });
  });

  it('keeps the section but drops the number when the price page fails', async () => {
    const { commerce } = await resolvePlaceCommerce(
      { placeName: 'SPA LAND Centum City' },
      { catalogue: ticketed({ priceSource: { ...PRICE_SOURCE, url: `${fixtureOrigin}/boom` } }) },
    );
    expect(commerce).toMatchObject({ admissionRequired: true });
    expect((commerce as { officialPrice?: unknown }).officialPrice).toBeUndefined();
    // No 官方網站 button here: the fixture's price page is a local http:// server,
    // and a booking link must be https to earn a button. That is the validation
    // doing its job, not a gap — a real operator page is https and would render.
    expect((commerce as { bookingOptions: unknown[] }).bookingOptions).toEqual([]);
  });

  it('says nothing at all for an uncatalogued place with no category signal', async () => {
    const { commerce } = await resolvePlaceCommerce({ placeName: '某個地方' }, { catalogue: [] });
    expect(commerce).toBeNull();
  });

  it('marks a free place free', async () => {
    const { commerce } = await resolvePlaceCommerce(
      { placeName: '海雲台海水浴場', details: { types: ['beach'] } },
      { catalogue: [] },
    );
    expect(commerce).toEqual({ admissionRequired: false });
  });

  it('never produces a price from the category layer alone', async () => {
    const { commerce } = await resolvePlaceCommerce(
      { placeName: '釜山水族館', details: { types: ['aquarium'], websiteUri: 'https://aquarium.example' } },
      { catalogue: [] },
    );
    expect(commerce).toMatchObject({ admissionRequired: true });
    expect((commerce as { officialPrice?: unknown }).officialPrice).toBeUndefined();
  });
});

/**
 * The gap that let a dead route ship twice: nothing ever spoke HTTP to it. This
 * mounts the exact handler server.ts mounts, on a real server, and asks it real
 * questions. It fails if the route is missing, if it 404s, or if the body parser
 * is not in front of it.
 */
describe('POST /api/places/commerce — real HTTP round trip', () => {
  let routeServer: Server;
  let origin = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    registerPlaceCommerceRoute(app, {
      googleApiKey: () => undefined,
      catalogue: [{
        nameKeys: ['spalandcentumcity'],
        admissionRequired: true,
        priceSource: PRICE_SOURCE,
        notes: ['未滿 19 歲不可入場'],
      }],
    });
    await new Promise<void>(resolve => { routeServer = app.listen(0, resolve); });
    const address = routeServer.address();
    origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => routeServer.close(() => resolve()));
  });

  const ask = async (body: unknown) => {
    const response = await fetch(`${origin}/api/places/commerce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, payload: await response.json() as { commerce: Record<string, unknown> | null } };
  };

  it('answers 200 with a live price for SPA LAND', async () => {
    const { status, payload } = await ask({ placeName: 'SPA LAND Centum City', city: '釜山', country: '韓國' });
    expect(status).toBe(200);
    expect(payload.commerce).toMatchObject({
      admissionRequired: true,
      officialPrice: { amount: 26000, currency: 'KRW', sourceName: '官方網站', sourceUrl: PRICE_SOURCE.url },
    });
  });

  it('reads the request body at all — the 404-equivalent regression', async () => {
    // With the route mounted before express.json(), req.body is undefined and this
    // comes back null no matter what is asked.
    const { payload } = await ask({ placeName: 'SPA LAND Centum City' });
    expect(payload.commerce).not.toBeNull();
  });

  it('answers 200 and null for an unknown place rather than erroring', async () => {
    const { status, payload } = await ask({ placeName: '某個不在名錄裡的地方' });
    expect(status).toBe(200);
    expect(payload.commerce).toBeNull();
  });

  it('answers 200 and null for an empty request', async () => {
    const { status, payload } = await ask({});
    expect(status).toBe(200);
    expect(payload.commerce).toBeNull();
  });

  it('serves the second request for a place from cache', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await ask({ placeName: 'SPA LAND Centum City' });
    const callsAfterFirst = spy.mock.calls.length;
    await ask({ placeName: 'SPA LAND Centum City' });
    // One call for the test's own request; the operator page is not re-read.
    expect(spy.mock.calls.length - callsAfterFirst).toBe(1);
    spy.mockRestore();
  });
});
