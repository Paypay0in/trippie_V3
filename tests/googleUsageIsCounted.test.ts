/**
 * The call count stops being something I invent.
 *
 * Every monthly figure quoted to the Founder — $3,000, $9,000, $12,000 at
 * 10,000 testers — was a published unit price multiplied by a call count I
 * assumed. The prices were measured; the counts never were, and the whole
 * spread between those numbers lives inside the assumption.
 *
 * Two things are pinned here, and the second is the one that rots:
 *
 *  1. The SKU derivation, against the exact masks this app sends today.
 *  2. That **no Google call site bypasses the counter**. That assertion reads
 *     `server.ts` directly, because a new `fetch` to a Google host is the way
 *     this silently stops working — the counter keeps answering, just with a
 *     number that is too small, which is worse than answering nothing.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  skuForRequest,
  recordGoogleCall,
  googleUsageSnapshot,
  resetGoogleUsage,
  SKU_PRICE_PER_1000,
} from '../services/googleSkuUsage';

const server = readFileSync(join(process.cwd(), 'server.ts'), 'utf8');

describe('deriving the SKU from the request', () => {
  it('reads a Place Details tier off its field mask', () => {
    // The mask this app sends today, after the Enterprise fields came off.
    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places/ChIJabc',
      fieldMask: 'id,displayName,formattedAddress,addressComponents,location,googleMapsUri,primaryType',
    })).toBe('place_details_pro');

    // The same call once the caller says it already has the category.
    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places/ChIJabc',
      fieldMask: 'id,displayName,formattedAddress,addressComponents,location,googleMapsUri',
    })).toBe('place_details_pro');

    // A phone number is a tier, not a field.
    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places/ChIJabc',
      fieldMask: 'id,location,nationalPhoneNumber',
    })).toBe('place_details_enterprise');

    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places/ChIJabc',
      fieldMask: 'id,location,editorialSummary',
    })).toBe('place_details_enterprise_atmosphere');
  });

  it('separates a photo from the details call it looks like', () => {
    // Both contain `/places/`; only one is billed as a photo.
    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places/ChIJabc/photos/x/media?maxWidthPx=720',
    })).toBe('place_photo');
  });

  it('prices a search by its mask, the way Google does', () => {
    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places:searchText',
      fieldMask: 'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.photos,places.primaryType',
    })).toBe('text_search_pro');

    expect(skuForRequest({
      url: 'https://places.googleapis.com/v1/places:searchText',
      fieldMask: 'places.id',
    })).toBe('text_search_essentials');
  });

  it('names autocomplete and routes without a mask', () => {
    expect(skuForRequest({ url: 'https://places.googleapis.com/v1/places:autocomplete' })).toBe('autocomplete');
    expect(skuForRequest({ url: 'https://routes.googleapis.com/directions/v2:computeRoutes' })).toBe('routes_compute');
  });
});

describe('the snapshot', () => {
  beforeEach(() => { resetGoogleUsage(); });

  it('counts per day and per SKU, not as one total', () => {
    const day = new Date('2026-11-05T12:00:00Z');
    recordGoogleCall({ url: 'https://places.googleapis.com/v1/places:autocomplete' }, day, () => {});
    recordGoogleCall({ url: 'https://places.googleapis.com/v1/places:autocomplete' }, day, () => {});
    recordGoogleCall({ url: 'https://routes.googleapis.com/directions/v2:computeRoutes' }, day, () => {});

    const snapshot = googleUsageSnapshot();
    expect(snapshot.days).toHaveLength(1);
    expect(snapshot.days[0].calls).toEqual({ autocomplete: 2, routes_compute: 1 });
  });

  it('prices the day at the marginal rate, and says that in the field name', () => {
    const day = new Date('2026-11-05T12:00:00Z');
    for (let i = 0; i < 1000; i += 1) {
      recordGoogleCall({ url: 'https://routes.googleapis.com/directions/v2:computeRoutes' }, day, () => {});
    }
    // 1,000 route calls at $5/1000, with no free quota subtracted — which is
    // the point: a process cannot know the account's remaining free tier.
    expect(googleUsageSnapshot().days[0].marginalUsdIgnoringFreeQuota).toBe(SKU_PRICE_PER_1000.routes_compute);
  });

  it('says when it started counting, so it cannot be read as a month', () => {
    expect(googleUsageSnapshot().countingSince).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('counts a failed call, because Google bills for served errors', () => {
    const logged: string[] = [];
    recordGoogleCall(
      { url: 'https://places.googleapis.com/v1/places:searchText', fieldMask: 'places.id,places.location' },
      new Date('2026-11-05T01:00:00Z'),
      line => logged.push(line),
    );
    // The counter does not take a status, so there is nowhere for a 429 to be
    // dropped. The log line is the record that outlives the process.
    expect(logged[0]).toContain('[google-sku] 2026-11-05 text_search_pro count=1');
  });
});

describe('no call site bypasses the counter', () => {
  it('routes every Google request through billedFetch', () => {
    const offenders = server
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /places\.googleapis\.com|routes\.googleapis\.com/.test(line))
      .filter(({ line }) => /\bfetch\(/.test(line))
      .filter(({ line }) => !/billedFetch\(/.test(line));

    expect(offenders.map(o => `${o.number}: ${o.line.trim().slice(0, 80)}`)).toEqual([]);
  });

  it('derives the SKU inside the wrapper rather than taking a label', () => {
    // A label passed by the caller is a second opinion about cost, and it is
    // the one that goes stale when the mask changes.
    const wrapper = server.slice(server.indexOf('const billedFetch'), server.indexOf('const billedFetch') + 500);
    expect(wrapper).toContain('recordGoogleCall({ url, fieldMask: headers["X-Goog-FieldMask"] })');
  });

  it('exposes the snapshot read-only, buying nothing', () => {
    const start = server.indexOf('app.get("/api/usage/google"');
    expect(start).toBeGreaterThan(-1);
    const body = server.slice(start, start + 200);
    expect(body).toContain('googleUsageSnapshot()');
    expect(body).not.toContain('fetch(');
  });
});
