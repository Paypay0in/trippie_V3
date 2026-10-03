import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlaceBasicsCache,
  fetchPlaceBasics,
  hoursForToday,
  normalizePlaceBasics,
  summarizePlaceBasics,
} from './placeBasicsService';

/**
 * 「這個你要基本查一些資訊 不能讓這個行程空白」.
 *
 * A screenshot that named 다고소님 and said nothing else left a card with a name
 * over an empty space, which cannot be told apart from a row that failed. Every
 * field here is one Google returns about that exact place — nothing is written
 * by a model, because an invented sentence about a restaurant reads exactly
 * like a true one.
 */

beforeEach(clearPlaceBasicsCache);
afterEach(() => { vi.unstubAllGlobals(); });

const stubFetch = (basics: unknown) => {
  const json = vi.fn().mockResolvedValue({ basics });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('fetchPlaceBasics', () => {
  it('asks for nothing without a resolved place', async () => {
    // A name alone could be any of several branches; looking one up would be a
    // guess wearing the clothes of a fact.
    const fetchMock = stubFetch({ kind: '咖啡廳' });

    expect(await fetchPlaceBasics(undefined)).toBeNull();
    expect(await fetchPlaceBasics('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks once per place', async () => {
    const fetchMock = stubFetch({ kind: '咖啡廳' });

    await Promise.all([fetchPlaceBasics('g-1'), fetchPlaceBasics('g-1')]);
    await fetchPlaceBasics('g-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is null when the lookup fails, never an exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(fetchPlaceBasics('g-2')).resolves.toBeNull();
  });
});

describe('normalizePlaceBasics', () => {
  it('drops a rating with no reviews behind it', () => {
    // ★5.0 from one review is a number that misleads more than it informs.
    expect(normalizePlaceBasics({ kind: '咖啡廳', rating: 5, ratingCount: 0 })).toEqual(
      expect.objectContaining({ rating: undefined, ratingCount: undefined }),
    );
  });

  it('keeps a rating that has a count', () => {
    expect(normalizePlaceBasics({ rating: 4.5, ratingCount: 312 })).toEqual(
      expect.objectContaining({ rating: 4.5, ratingCount: 312 }),
    );
  });

  it('is null when nothing usable came back', () => {
    expect(normalizePlaceBasics({})).toBeNull();
    expect(normalizePlaceBasics(null)).toBeNull();
    expect(normalizePlaceBasics({ weekdayHours: [] })).toBeNull();
  });
});

describe('summarizePlaceBasics', () => {
  it('leads with what kind of place it is', () => {
    expect(summarizePlaceBasics({ kind: '咖啡廳', rating: 4.5, ratingCount: 312 }))
      .toBe('咖啡廳 · ★ 4.5（312）');
  });

  it('says so when the place has closed for good', () => {
    // The most important fact there is about a place to go to.
    expect(summarizePlaceBasics({ kind: '咖啡廳', businessStatus: 'CLOSED_PERMANENTLY' }))
      .toBe('已永久歇業');
  });

  it('is empty when there is nothing to say', () => {
    expect(summarizePlaceBasics(null)).toBe('');
    expect(summarizePlaceBasics({})).toBe('');
  });
});

describe('hoursForToday', () => {
  const week = ['週一 09:00–18:00', '週二 09:00–18:00', '週三 09:00–18:00', '週四 09:00–18:00', '週五 09:00–21:00', '週六 10:00–21:00', '週日 休息'];

  it('reads Sunday off the end, where Google puts it', () => {
    // Google's list is Monday-first; getDay() is Sunday-first.
    expect(hoursForToday({ weekdayHours: week }, new Date('2026-10-04T10:00:00'))).toBe('週日 休息');
  });

  it('reads Monday off the front', () => {
    expect(hoursForToday({ weekdayHours: week }, new Date('2026-10-05T10:00:00'))).toBe('週一 09:00–18:00');
  });

  it('is undefined for a partial week', () => {
    expect(hoursForToday({ weekdayHours: ['週一 09:00–18:00'] })).toBeUndefined();
    expect(hoursForToday(null)).toBeUndefined();
  });
});
