/**
 * 「若在收藏中 有這個地點 應該要在收藏中可以看到我去的紀錄」.
 *
 * The collection holds what somebody else said about a place; the review
 * holds what happened when you went. This is the join, and it is deliberately
 * narrow: one wrong match puts another temple's photographs on this card.
 */
import { describe, expect, it } from 'vitest';
import { myRecordAtPlace } from './myRecordAtPlace';
import { ItineraryItem, SavedTravelInspiration } from '../types';

const stop = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: 'i1', time: '19:00', title: '待乳山聖天', location: '', notes: '',
  type: 'ACTIVITY', date: '2026-10-21',
  ...over,
});

const saved = (over: Partial<SavedTravelInspiration> = {}) =>
  ({ placeName: '待乳山聖天', ...over }) as SavedTravelInspiration;

describe('myRecordAtPlace', () => {
  it('finds the stars, the photos and the diary written at this place', () => {
    const [record] = myRecordAtPlace(
      saved(),
      [{ name: '東京之旅', itinerary: [stop({ rating: 5, photos: ['gate'] })] }],
      { i1: { text: '很寧靜' } },
    );

    expect(record.rating).toBe(5);
    expect(record.photos).toEqual(['gate']);
    expect(record.diary).toBe('很寧靜');
    expect(record.tripName).toBe('東京之旅');
  });

  it('matches on the resolved place id as well as the name', () => {
    const found = myRecordAtPlace(
      saved({ placeName: 'Matsuchiyama Shoden', placeId: 'ChIJ-t' }),
      [{ itinerary: [stop({ title: '待乳山聖天', placeId: 'ChIJ-t', rating: 4 })] }],
    );

    expect(found).toHaveLength(1);
  });

  /*
    A stop with nothing on it is a line in an itinerary. Repeating it here
    says nothing the 已訪 chip has not already said.
  */
  it('ignores a stop that recorded nothing', () => {
    expect(myRecordAtPlace(saved(), [{ itinerary: [stop()] }])).toEqual([]);
  });

  it('never matches a different place', () => {
    const found = myRecordAtPlace(
      saved(),
      [{ itinerary: [stop({ title: '淺草寺', rating: 5 })] }],
    );

    expect(found).toEqual([]);
  });

  /* A place with no name and no id cannot be matched on anything. */
  it('matches nothing for a place with no identity', () => {
    expect(myRecordAtPlace({} as SavedTravelInspiration, [{ itinerary: [stop({ rating: 5 })] }]))
      .toEqual([]);
  });

  it('puts the most recent visit first', () => {
    const found = myRecordAtPlace(saved(), [
      { itinerary: [stop({ id: 'old', date: '2025-03-02', rating: 3 })] },
      { itinerary: [stop({ id: 'new', date: '2026-10-21', rating: 5 })] },
    ]);

    expect(found.map(record => record.itemId)).toEqual(['new', 'old']);
  });
});
