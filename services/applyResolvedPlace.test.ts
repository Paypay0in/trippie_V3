/**
 * 「這邊我做過了 已經重新定位過了 結果沒有儲存」.
 *
 * 다곡소님 was re-pointed at a real place and came back under 「還沒定位的地點」.
 * Every field was written unconditionally, so a resolve that answered with an
 * id and nothing else — or the silent backfill passing over the same record
 * afterwards — wrote `undefined` over the position that had just been set.
 */
import { describe, expect, it } from 'vitest';
import { applyResolvedPlace } from './applyResolvedPlace';
import { SavedTravelInspiration } from '../types';

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'insp-dago',
  savedByUserId: 'user-1',
  country: '韓國',
  city: '韓國',
  placeName: '다곡소님',
  sourcePostId: 'screenshot:a',
  sourceSliceId: 'screenshot:a',
  sourceCreatorId: 'user-1',
  sourceNoteIds: [],
  notes: [],
  savedAt: '2026-10-03T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

describe('what a resolve writes', () => {
  it('stores the position it found', () => {
    const next = applyResolvedPlace(saved(), {
      placeId: 'ChIJ-dago', placeName: '단골손님', latitude: 35.0996, longitude: 129.0324,
      address: '부산 중구', city: '釜山', district: 'Jung-gu',
    });

    expect(next.latitude).toBe(35.0996);
    expect(next.longitude).toBe(129.0324);
    expect(next.city).toBe('釜山');
    expect(next.placeId).toBe('ChIJ-dago');
  });

  /* The bug, exactly: a second pass with no coordinates used to erase them. */
  it('does not erase a position when the next resolve has none', () => {
    const bound = applyResolvedPlace(saved(), {
      placeId: 'ChIJ-dago', placeName: '단골손님', latitude: 35.0996, longitude: 129.0324,
    });

    const after = applyResolvedPlace(bound, { placeId: 'ChIJ-dago', placeName: '단골손님' });

    expect(after.latitude).toBe(35.0996);
    expect(after.longitude).toBe(129.0324);
  });

  it('keeps the address and the name it already had', () => {
    const bound = saved({ formattedAddress: '부산 중구 BIFF광장로', resolvedPlaceName: '단골손님' });

    const after = applyResolvedPlace(bound, { placeId: 'ChIJ-dago', placeName: '' });

    expect(after.formattedAddress).toBe('부산 중구 BIFF광장로');
    expect(after.resolvedPlaceName).toBe('단골손님');
  });

  /*
    Both or neither. A latitude kept beside a dropped longitude is a record
    that passes 「has coordinates」 and cannot be drawn on anything.
  */
  it('refuses half a position', () => {
    const after = applyResolvedPlace(saved(), {
      placeId: 'ChIJ-dago', placeName: '단골손님', latitude: 35.0996,
    });

    expect(after.latitude).toBeUndefined();
    expect(after.longitude).toBeUndefined();
  });

  it('takes a better position when one arrives', () => {
    const bound = saved({ latitude: 1, longitude: 2 });

    const after = applyResolvedPlace(bound, {
      placeId: 'ChIJ-dago', placeName: '단골손님', latitude: 35.0996, longitude: 129.0324,
    });

    expect(after.latitude).toBe(35.0996);
  });

  /* 「餐廳」 from the screenshot survives a resolve that knows no type. */
  it('does not empty a tag the screenshot already gave it', () => {
    const after = applyResolvedPlace(saved({ category: 'food' }), {
      placeId: 'ChIJ-dago', placeName: '단골손님',
    });

    expect(after.category).toBe('food');
  });

  it('takes Google’s type when there is one', () => {
    const after = applyResolvedPlace(saved(), {
      placeId: 'ChIJ-dago', placeName: '단골손님', primaryType: 'restaurant',
    });

    expect(after.category).toBe('food');
  });

  /* The stamp is what ends the 補齊 loop, so it is written either way. */
  it('always stamps when it was asked', () => {
    expect(applyResolvedPlace(saved(), { placeId: 'x', placeName: 'y' }).placeResolvedAt).toBeTruthy();
  });
});
