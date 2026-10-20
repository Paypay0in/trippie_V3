import { describe, expect, it } from 'vitest';
import { hiddenSameCountrySaves } from './hiddenSameCountrySaves';
import { SavedTravelInspiration } from '../types';

/**
 * 「我的東京儲存的旅遊靈感都不見了」 — a 東京 trip showing one of twenty-two.
 */
const TOKYO = {
  destination: '東京',
  destinationCountry: '日本',
  destinationLatitude: 35.6762,
  destinationLongitude: 139.6503,
};

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration => ({
  id: 'i', savedByUserId: 'me', placeName: 'x', country: '日本', city: '東京',
  notes: [], sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c',
  sourceNoteIds: [], savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

describe('hiddenSameCountrySaves', () => {
  /*
    The case from the screenshot: the city field holds a ward, there are no
    coordinates, so the text comparison hides it on a city-scoped trip.
  */
  it('counts a save whose city is really a ward, with no coordinates', () => {
    expect(hiddenSameCountrySaves([saved({ id: 'a', city: '台東區' })], TOKYO)).toBe(1);
  });

  it('does not count one the list is already showing', () => {
    expect(hiddenSameCountrySaves([saved({ id: 'a', city: '東京' })], TOKYO)).toBe(0);
  });

  /*
    A located save that still did not match was judged on its coordinates and
    is genuinely somewhere else. Resolving it again would change nothing, so
    counting it would send the traveller to press a button that cannot help.
  */
  it('does not count a located save that is really in another city', () => {
    const osaka = saved({ id: 'b', city: '大阪', latitude: 34.6937, longitude: 135.5023 });
    expect(hiddenSameCountrySaves([osaka], TOKYO)).toBe(0);
  });

  it('does not count another country', () => {
    expect(hiddenSameCountrySaves([saved({ id: 'c', country: '韓國', city: '釜山' })], TOKYO)).toBe(0);
  });

  /* A save the table cannot place is exactly what the backfill is for. */
  it('counts a save whose country is not recognisable', () => {
    expect(hiddenSameCountrySaves([saved({ id: 'd', country: '', city: '' })], TOKYO)).toBe(1);
  });

  it('counts nothing for an empty collection', () => {
    expect(hiddenSameCountrySaves([], TOKYO)).toBe(0);
  });

  it('adds them up', () => {
    const hidden = [
      saved({ id: 'a', city: '台東區' }),
      saved({ id: 'b', city: '澀谷區' }),
      saved({ id: 'c', city: '東京' }),
    ];
    expect(hiddenSameCountrySaves(hidden, TOKYO)).toBe(2);
  });
});
