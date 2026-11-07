/**
 * 「首圖不見了」 — the 新莊 trip wearing the gradient.
 *
 * Measured against production before this was written: resolve answers 新莊 with
 * 新莊區 and `photoAvailable: true`, and the photo endpoint returns a photo. The
 * server could always answer; the trip had no placeId to ask with, and only
 * trip creation ever wrote one.
 */
import { describe, expect, it } from 'vitest';
import { needsPlaceBackfill, placeBackfillPatch } from './tripPlaceBackfill';
import { TripDraft } from './tripPersistence';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const draft = (overrides: Partial<TripDraft> = {}): TripDraft => ({
  id: 'trip-1',
  ownerId: 'me',
  name: '新莊',
  destination: '新莊',
  ...overrides,
} as TripDraft);

const resolved = {
  placeId: 'ChIJzR9IRumnQjQRpRMgY89zysA',
  address: '242台灣新北市新莊區',
  latitude: 25.0265985,
  longitude: 121.4178347,
  country: '台灣',
};

describe('which trips spend a lookup', () => {
  it('backfills a trip that has a destination and no place', () => {
    expect(needsPlaceBackfill(draft())).toBe(true);
  });

  it('never asks again once the trip knows its place', () => {
    // Repeating the lookup is how an optional picture turns into a bill.
    expect(needsPlaceBackfill(draft({ destinationPlaceId: 'ChIJ-existing' }))).toBe(false);
  });

  it('asks nothing for a trip with no destination', () => {
    expect(needsPlaceBackfill(draft({ destination: '   ' }))).toBe(false);
    expect(needsPlaceBackfill(undefined)).toBe(false);
  });
});

describe('what the backfill writes', () => {
  it('writes the place, and the blanks it can fill', () => {
    expect(placeBackfillPatch(draft(), resolved)).toEqual({
      destinationPlaceId: resolved.placeId,
      destinationAddress: resolved.address,
      destinationLatitude: resolved.latitude,
      destinationLongitude: resolved.longitude,
      destinationCountry: resolved.country,
    });
  });

  it('leaves everything the trip already knows alone', () => {
    /*
      These can have been corrected by the traveller or arrived from a
      companion's device. A backfill that overwrites them is answering a
      question nobody asked.
    */
    const known = draft({
      destinationAddress: '他自己打的地址',
      destinationLatitude: 1,
      destinationLongitude: 2,
      destinationCountry: '日本',
    });
    expect(placeBackfillPatch(known, resolved)).toEqual({ destinationPlaceId: resolved.placeId });
  });

  it('writes nothing when the lookup came back without a place', () => {
    // A half-filled trip would look resolved and still show no cover.
    expect(placeBackfillPatch(draft(), null)).toBeNull();
    expect(placeBackfillPatch(draft(), { address: '新北市' })).toBeNull();
    expect(placeBackfillPatch(draft(), { placeId: '  ' })).toBeNull();
  });
});

describe('the trip screen asks once', () => {
  const app = readFileSync(join(process.cwd(), 'App.tsx'), 'utf8');

  /*
    Read off the source because the cost is invisible from outside: a backfill
    that forgets its attempt still renders a correct cover, and bills a Place
    lookup on every pass while doing it.
  */
  it('backfills the open trip through the shared rule', () => {
    expect(app).toContain('needsPlaceBackfill(');
    expect(app).toContain('placeBackfillPatch(');
  });

  it('remembers the attempt, so a failed lookup is not repeated', () => {
    const effect = app.slice(app.indexOf('placeBackfillAttemptedRef'));
    expect(effect).toContain('placeBackfillAttemptedRef.current');
  });
});
