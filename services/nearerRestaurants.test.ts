/**
 * 「能自動由我的收藏清單中推薦取代2的餐廳並列出」.
 *
 * His 淺草 day, with the coordinates the live place service returns. 拉麵 改 is
 * the one 優化動線 names as costing a detour to reach at lunchtime.
 */
import { describe, expect, it } from 'vitest';
import { nearerRestaurants } from './nearerRestaurants';
import { ItineraryItem } from '../types';

const stop = (id: string, time: string, latitude: number, longitude: number): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: '2026-10-22', time,
  durationMinutes: 90, latitude, longitude, address: 'Taito City, Tokyo',
} as ItineraryItem);

/* Walked in this order; 拉麵 改 sits between HARRY and Leaves. */
const day = [
  stop('senso', '10:00', 35.7147651, 139.7966553),
  stop('harry', '11:46', 35.7111133, 139.7976072),
  stop('ramen', '13:34', 35.70444, 139.7901561),
  stop('leaves', '15:21', 35.7027051, 139.7978326),
  stop('lonich', '17:07', 35.7012377, 139.7895126),
];

const saved = [
  // Right between HARRY and Leaves: almost no detour at all.
  { id: 's-near', placeName: 'KURAMAE CANNELE', category: 'cafe', latitude: 35.7069, longitude: 139.7977 },
  { id: 's-far', placeName: '新宿御苑前の店', category: 'food', latitude: 35.6852, longitude: 139.7100 },
  { id: 's-shop', placeName: 'proto 器とタカラモノ', category: 'shop', latitude: 35.7070, longitude: 139.7978 },
  { id: 's-planned', placeName: 'Imadeya', category: 'food', latitude: 35.7071, longitude: 139.7979, alreadyPlanned: true },
];

describe('nearerRestaurants', () => {
  it('offers the saved place that costs less of a detour', () => {
    const swaps = nearerRestaurants(day, 'ramen', saved);

    expect(swaps.map(swap => swap.id)).toContain('s-near');
    expect(swaps[0].savesKm).toBeGreaterThan(0);
  });

  /* A shop cannot be lunch. */
  it('offers only places that feed somebody', () => {
    expect(nearerRestaurants(day, 'ramen', saved).map(swap => swap.id)).not.toContain('s-shop');
  });

  /* Somewhere already on the plan is not a replacement, it is a duplicate. */
  it('skips a place already on the trip', () => {
    expect(nearerRestaurants(day, 'ramen', saved).map(swap => swap.id)).not.toContain('s-planned');
  });

  /* Further away is not an answer to 「this one is too far」. */
  it('never offers somewhere worse', () => {
    expect(nearerRestaurants(day, 'ramen', saved).map(swap => swap.id)).not.toContain('s-far');
  });

  it('offers at most three', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `s-${index}`, placeName: `near ${index}`, category: 'food',
      latitude: 35.7069 + index * 0.0001, longitude: 139.7977,
    }));

    expect(nearerRestaurants(day, 'ramen', many)).toHaveLength(3);
  });

  /* A hundred metres is noise, not a reason to change where somebody eats. */
  it('says nothing about a saving nobody would feel', () => {
    const almostIdentical = [{
      id: 's-same', placeName: '隔壁', category: 'food',
      latitude: 35.70444, longitude: 139.79016,
    }];

    expect(nearerRestaurants(day, 'ramen', almostIdentical)).toEqual([]);
  });

  it('has nothing to say about a stop that is not on the day', () => {
    expect(nearerRestaurants(day, 'nope', saved)).toEqual([]);
  });

  /* One stop on a day has no neighbours, so it causes no detour. */
  it('has nothing to say about a day of one', () => {
    expect(nearerRestaurants([day[2]], 'ramen', saved)).toEqual([]);
  });
});
