/**
 * The 🏷️ tag is read from the search that already happened, not bought again.
 *
 * `primaryType` was the only Pro-tier field left in the Place Details mask:
 * with it the call is $17/1000 with 5,000 free, without it $5/1000 with 10,000
 * free. Autocomplete carries each prediction's `types` inside an answer this
 * app already pays $2.83/1000 for. Scored over 50 real places (TW/JP/KR), the
 * free source agrees with or improves on `primaryType` 48 times.
 *
 * The first rule I wrote read the array positionally and I withdrew it: Google
 * does not return `types` in order of primacy, and the same place came back in
 * two different orders on two calls, which made the tag depend on the day. The
 * fold is a set plus `CATEGORY_PRECEDENCE` instead.
 *
 * Both halves are pinned here, because dropping either silently loses money or
 * silently loses the tag:
 *
 *  - the precedence rule, which is order-independent by design;
 *  - `needsCategory: false` actually reaching the request, and the server
 *    actually dropping the field when it arrives.
 *
 * The cases kept here are the ones that broke a rule I actually wrote: a market
 * that is also an attraction, and a restaurant whose types arrived behind
 * `food_store`.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { categoryFromTypes, placeCategory, CATEGORY_RULES } from '../services/placeCategory';

describe('reading a category out of an autocomplete types array', () => {
  it('prefers the specific type over the umbrella it arrives with', () => {
    // 札嘎其市場: without the umbrella filter, `tourist_attraction` makes a
    // market a sight.
    expect(categoryFromTypes(['tourist_attraction', 'point_of_interest', 'market', 'establishment'])).toBe('shop');
  });

  it('gives the same answer whichever order Google sends', () => {
    /*
      Measured, not supposed: 蔦屋書店 came back as `book_store` before `cafe`
      on one call and after it on another. A positional rule tagged 金峰魯肉飯
      「shop」 on the day `food_store` happened to arrive first.
    */
    const order = ['food_store', 'deli', 'taiwanese_restaurant', 'restaurant'];
    expect(categoryFromTypes(order)).toBe('food');
    expect(categoryFromTypes([...order].reverse())).toBe('food');
  });

  it('answers the places primaryType leaves as an umbrella', () => {
    // 大阪環球影城: `amusement_center` is read by nothing, so the paid field
    // says 「other」; the free array carries `amusement_park`.
    expect(categoryFromTypes(['point_of_interest', 'tourist_attraction', 'amusement_center', 'establishment', 'amusement_park'])).toBe('sight');
    expect(placeCategory({ primaryType: 'amusement_center' })).toBe('other');
  });

  it('falls back to an umbrella rather than to no tag', () => {
    // A place carrying nothing specific: 「shop」 beats a blank tag.
    expect(categoryFromTypes(['store', 'point_of_interest', 'establishment'])).toBe('shop');
  });

  it('says nothing when the array says nothing', () => {
    expect(categoryFromTypes(undefined)).toBeUndefined();
    expect(categoryFromTypes([])).toBeUndefined();
    expect(categoryFromTypes(['political', 'geocode'])).toBeUndefined();
  });

  it('reads the free types before the paid primaryType', () => {
    expect(placeCategory({ types: ['ramen_restaurant'], primaryType: 'book_store' })).toBe('food');
    // And still reads primaryType when no types came: the backfill over
    // records saved before this has none.
    expect(placeCategory({ primaryType: 'book_store' })).toBe('shop');
  });

  it('keeps the slice the traveller already stated above both', () => {
    expect(placeCategory({ sliceType: 'food', types: ['book_store'] })).toBe('food');
  });

  it('bumped the rules version, so records settled as 「other」 get re-asked', () => {
    // 「other」 means 「asked, and there was no answer」, which is what ends the
    // backfill. Changing the source without this freezes every place settled
    // under the old rules on its old answer forever.
    expect(CATEGORY_RULES).toBeGreaterThanOrEqual(3);
  });
});

describe('what the details request is asked to pay for', () => {
  const server = readFileSync(join(process.cwd(), 'server.ts'), 'utf8');

  const detailsEndpoint = (): string => {
    const start = server.indexOf('app.post("/api/places/details"');
    const next = server.indexOf('app.post(', start + 1);
    return server.slice(start, next === -1 ? undefined : next);
  };

  it('only asks for primaryType when the caller has no cheaper source', () => {
    const body = detailsEndpoint();
    // The field is conditional on the flag, not unconditionally in the mask.
    expect(body).toMatch(/needsCategory\s*\?\s*",primaryType"/);
    expect(body).not.toMatch(/X-Goog-FieldMask":\s*"[^"]*primaryType/);
  });

  it('defaults to asking, because an untagged place ends its own backfill', () => {
    expect(detailsEndpoint()).toContain('req.body?.needsCategory !== false');
  });
});

describe('resolving a chosen candidate', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const detailsBody = async (): Promise<Record<string, unknown>> => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        json: async () => ({ id: 'p1', location: '金峰魯肉飯', latitude: 25, longitude: 121 }),
      } as unknown as Response;
    }));
    const { resolveCandidate } = await import('../services/placeCandidates');
    await resolveCandidate({ placeId: 'p1', name: '金峰魯肉飯', types: ['taiwanese_restaurant', 'food'] });
    return calls[0];
  };

  it('does not buy primaryType when the search already carried types', async () => {
    expect(await detailsBody()).toMatchObject({ needsCategory: false });
  });

  it('still buys it for a candidate with no types', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ({ id: 'p2', location: 'X', latitude: 1, longitude: 2 }) } as unknown as Response;
    }));
    const { resolveCandidate } = await import('../services/placeCandidates');
    await resolveCandidate({ placeId: 'p2', name: 'X' });
    expect(calls[0]).not.toHaveProperty('needsCategory');
  });

  it('hands the types on, so the tag is read from them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'p1', location: '金峰魯肉飯', latitude: 25, longitude: 121 }),
    } as unknown as Response)));
    const { resolveCandidate } = await import('../services/placeCandidates');
    const resolved = await resolveCandidate({ placeId: 'p1', name: '金峰魯肉飯', types: ['taiwanese_restaurant'] });
    expect(resolved?.types).toEqual(['taiwanese_restaurant']);
    expect(placeCategory({ primaryType: resolved?.primaryType, types: resolved?.types })).toBe('food');
  });
});

describe('the autocomplete endpoint', () => {
  const server = readFileSync(join(process.cwd(), 'server.ts'), 'utf8');

  it('forwards the types it was already paid to fetch', () => {
    const start = server.indexOf('app.post("/api/places/autocomplete"');
    const next = server.indexOf('app.post(', start + 1);
    const body = server.slice(start, next);
    expect(body).toContain('types: p.types');
  });
});
