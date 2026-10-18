/**
 * 「有空白行程的時候 會直接顯示附近的好地點 從收藏的優先推薦」.
 *
 * An empty row offered a button, and pressing it opened fifty places for
 * somebody to compare against a gap they can already see.
 */
import { describe, expect, it } from 'vitest';
import { suggestionsForSlot, WORTH_SUGGESTING_KM } from './suggestionsForSlot';
import { ItineraryItem } from '../types';

const stop = (id: string, latitude: number, longitude: number): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: '2026-10-22', time: '10:00',
  durationMinutes: 90, latitude, longitude,
} as ItineraryItem);

const before = stop('harry', 35.7111, 139.7976);
const after = stop('leaves', 35.7027, 139.7978);

const saved = [
  { id: 'near-cafe', placeName: 'KURAMAE CANNELE', category: 'cafe', latitude: 35.7069, longitude: 139.7977 },
  { id: 'near-food', placeName: 'Ramen Kai', category: 'food', latitude: 35.7070, longitude: 139.7978 },
  { id: 'near-shop', placeName: 'proto', category: 'shop', latitude: 35.7068, longitude: 139.7976 },
  { id: 'far-food', placeName: '新宿の店', category: 'food', latitude: 35.6852, longitude: 139.7100 },
  { id: 'planned', placeName: 'Imadeya', category: 'food', latitude: 35.7069, longitude: 139.7977, alreadyPlanned: true },
];

describe('suggestionsForSlot', () => {
  it('offers the places that barely bend the day', () => {
    const [first] = suggestionsForSlot('activity', before, after, saved);

    expect(first.detourKm).toBeLessThan(0.5);
  });

  /* A meal block wants somewhere to eat first. */
  it('leads with what the block is for', () => {
    expect(suggestionsForSlot('meal', before, after, saved)[0].id).toBe('near-food');
  });

  /*
    Leading rather than filtering: a shop can still be an afternoon, and a
    list that hid it would answer a narrower question than the one asked.
  */
  it('does not hide what the block is not for', () => {
    const ids = suggestionsForSlot('activity', before, after, saved).map(entry => entry.id);

    expect(ids).toContain('near-shop');
  });

  it('never offers something already on the plan', () => {
    const ids = suggestionsForSlot('activity', before, after, saved).map(entry => entry.id);

    expect(ids).not.toContain('planned');
  });

  it('offers at most three', () => {
    expect(suggestionsForSlot('activity', before, after, saved)).toHaveLength(3);
  });

  /*
    A detour that long is not a suggestion.

    His empty 10:00 block offered three theatres at 10, 10.2 and 14.8 km for a
    morning in 世田谷 — nothing was near, so it offered what was far and said
    so. An empty row saying only 「＋ 選一個地點」 is the honest answer.
  */
  it('leaves out a place too far out of the way to be worth it', () => {
    const offered = suggestionsForSlot('meal', before, after, saved);
    const ids = offered.map(entry => entry.id);

    expect(ids).toContain('near-food');
    expect(ids).not.toContain('far-food');
    offered.forEach(entry => expect(entry.detourKm).toBeLessThanOrEqual(WORTH_SUGGESTING_KM));
  });

  /*
    Distance before preference, past a kilometre.

    This is what put three theatres above a café three hundred metres away:
    preference sorted outright, so a 景點 anywhere beat a 餐廳 next door on an
    afternoon block.
  */
  it('does not let what the block is for outrank a much shorter walk', () => {
    const ids = suggestionsForSlot('activity', before, after, [
      { id: 'near-food', placeName: 'Ramen Kai', category: 'food', latitude: 35.7070, longitude: 139.7978 },
      { id: 'mid-sight', placeName: '劇場', category: 'sight', latitude: 35.7250, longitude: 139.8100 },
    ]).map(entry => entry.id);

    expect(ids[0]).toBe('near-food');
  });

  /* Inside a kilometre they are the same walk, and the block decides. */
  it('still leads with what the block is for when the walk is the same', () => {
    const ids = suggestionsForSlot('activity', before, after, [
      { id: 'near-food', placeName: 'Ramen Kai', category: 'food', latitude: 35.7070, longitude: 139.7978 },
      { id: 'near-sight', placeName: '小劇場', category: 'sight', latitude: 35.7072, longitude: 139.7980 },
    ]).map(entry => entry.id);

    expect(ids[0]).toBe('near-sight');
  });

  it('offers nothing rather than something far away', () => {
    const offered = suggestionsForSlot('meal', before, after, [
      { id: 'far-food', placeName: '新宿', category: 'food', latitude: 35.69, longitude: 139.70 },
    ]);

    expect(offered).toEqual([]);
  });

  /* One neighbour is still a corner to be near. */
  it('works at the start and end of a day', () => {
    expect(suggestionsForSlot('activity', undefined, after, saved).length).toBeGreaterThan(0);
    expect(suggestionsForSlot('activity', before, undefined, saved).length).toBeGreaterThan(0);
  });

  /*
    A gap with nothing either side has no detour to measure, and 「three places
    somewhere in this city」 is not a suggestion.
  */
  it('says nothing about an empty day', () => {
    expect(suggestionsForSlot('activity', undefined, undefined, saved)).toEqual([]);
  });

  it('says nothing when the collection has no coordinates', () => {
    expect(suggestionsForSlot('activity', before, after, [
      { id: 'x', placeName: 'Working holiday', category: 'sight' },
    ])).toEqual([]);
  });
});
