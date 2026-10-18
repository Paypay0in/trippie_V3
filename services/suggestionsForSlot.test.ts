/**
 * 「有空白行程的時候 會直接顯示附近的好地點 從收藏的優先推薦」.
 *
 * An empty row offered a button, and pressing it opened fifty places for
 * somebody to compare against a gap they can already see.
 */
import { describe, expect, it } from 'vitest';
import { suggestionsForSlot } from './suggestionsForSlot';
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
    Within what the block is for, the shorter detour wins. 新宿 is still
    offered when it is one of only two restaurants saved — it is simply last
    of them, and the kilometres beside it say why.
  */
  it('puts the long detour behind the short one', () => {
    const ids = suggestionsForSlot('meal', before, after, saved).map(entry => entry.id);

    expect(ids.indexOf('near-food')).toBeLessThan(ids.indexOf('far-food'));
    const far = suggestionsForSlot('meal', before, after, saved)
      .find(entry => entry.id === 'far-food');
    expect(far?.detourKm).toBeGreaterThan(5);
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
