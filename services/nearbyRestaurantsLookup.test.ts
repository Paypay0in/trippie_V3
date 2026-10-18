/**
 * 「或是 Ai 搜尋後推薦結果出現三個問用戶嗎」.
 *
 * Answered with Places rather than a language model: 「what restaurants are
 * near this point」 is a lookup. The payloads below are trimmed from the live
 * response for the 淺草 midpoint, asked on 2026-10-18.
 */
import { describe, expect, it } from 'vitest';
import { ENOUGH_RATINGS, readNearbyRestaurants } from './nearbyRestaurantsLookup';

const place = (over: Record<string, unknown>) => ({
  id: 'ChIJ-x', displayName: { text: '一蘭 淺草店' },
  location: { latitude: 35.7108, longitude: 139.7955 },
  rating: 4.3, userRatingCount: 5535,
  ...over,
});

describe('readNearbyRestaurants', () => {
  it('reads the places Google returned', () => {
    const [first] = readNearbyRestaurants({ places: [place({})] });

    expect(first).toEqual({
      placeId: 'ChIJ-x', placeName: '一蘭 淺草店',
      latitude: 35.7108, longitude: 139.7955,
      rating: 4.3, ratingCount: 5535,
    });
  });

  /*
    Ranked by popularity the first page still carries places with three
    reviews. 「5.0 from three people」 is not a recommendation, and this is
    replacing somewhere chosen on purpose.
  */
  it('drops a place too few people have been to', () => {
    const results = readNearbyRestaurants({
      places: [place({ userRatingCount: ENOUGH_RATINGS - 1 }), place({ id: 'ChIJ-y' })],
    });

    expect(results.map(entry => entry.placeId)).toEqual(['ChIJ-y']);
  });

  /* A place with no id or no position cannot be offered or drawn. */
  it('drops anything it could not use', () => {
    expect(readNearbyRestaurants({
      places: [
        place({ id: '' }),
        place({ displayName: { text: '  ' } }),
        place({ location: undefined }),
      ],
    })).toEqual([]);
  });

  /* A rating is optional; a place without one is still a real place. */
  it('keeps a place that has no rating', () => {
    const [first] = readNearbyRestaurants({
      places: [place({ rating: undefined, userRatingCount: 120 })],
    });

    expect(first.rating).toBeUndefined();
    expect(first.ratingCount).toBe(120);
  });

  it('says nothing about an empty or broken answer', () => {
    expect(readNearbyRestaurants({})).toEqual([]);
    expect(readNearbyRestaurants(null)).toEqual([]);
    expect(readNearbyRestaurants({ places: null })).toEqual([]);
  });
});
