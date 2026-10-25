/**
 * 「分類｜全部｜已訪｜待訪」.
 *
 * 「哪些咖啡廳我還沒去」 is one question. Answering it with two mutually
 * exclusive filters would mean asking it twice, so both chips narrow at once.
 */
import { describe, expect, it } from 'vitest';
import { categoriesIn, categoryOf, filterSavedPlaces } from './savedPlaceFilters';
import { PlaceVisit } from './visitedPlaces';
import { SavedTravelInspiration } from '../types';

const place = (id: string, patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id, savedByUserId: 'me', country: '日本', city: '東京',
  placeName: `Place ${id}`, placeId: `g-${id}`,
  sourcePostId: `manual:${id}`, sourceSliceId: `manual:${id}`, sourceCreatorId: 'me',
  sourceNoteIds: [], savedAt: '2026-10-01T00:00:00.000Z', notes: [], ...patch,
});

const places = [
  place('a', { category: 'cafe' }),
  place('b', { category: 'cafe' }),
  place('c', { category: 'food' }),
  place('d'),
];

const visits = new Map<string, PlaceVisit>([
  ['place:g-a', { date: '2026-10-02', stated: true } as PlaceVisit],
]);

const ids = (kept: SavedTravelInspiration[]) => kept.map(entry => entry.id);

describe('分類', () => {
  it('counts the tags that are there, commonest first', () => {
    expect(categoriesIn(places)).toEqual([['cafe', 2], ['food', 1], ['other', 1]]);
  });

  /*
    An untagged place is 「其他」 rather than invisible. The tag comes from
    Google and is routinely absent; dropping those would hide exactly the
    places somebody saved by hand.
  */
  it('reads a missing tag as 其他', () => {
    expect(categoryOf(place('x'))).toBe('other');
    expect(ids(filterSavedPlaces(places, { category: 'other', visited: 'all' }))).toEqual(['d']);
  });

  it('keeps only one tag', () => {
    expect(ids(filterSavedPlaces(places, { category: 'cafe', visited: 'all' }))).toEqual(['a', 'b']);
  });
});

describe('已訪 / 待訪', () => {
  it('keeps the ones already visited', () => {
    expect(ids(filterSavedPlaces(places, { category: 'all', visited: 'visited' }, visits)))
      .toEqual(['a']);
  });

  it('keeps the ones still to go', () => {
    expect(ids(filterSavedPlaces(places, { category: 'all', visited: 'not' }, visits)))
      .toEqual(['b', 'c', 'd']);
  });

  /* Nothing known about visits is nothing visited, not everything. */
  it('treats an absent record as not yet been', () => {
    expect(ids(filterSavedPlaces(places, { category: 'all', visited: 'visited' })))
      .toEqual([]);
    expect(filterSavedPlaces(places, { category: 'all', visited: 'not' })).toHaveLength(4);
  });
});

describe('兩個一起', () => {
  it('answers 哪些咖啡廳我還沒去', () => {
    expect(ids(filterSavedPlaces(places, { category: 'cafe', visited: 'not' }, visits)))
      .toEqual(['b']);
  });

  it('can end up with nothing, and says so by returning nothing', () => {
    expect(filterSavedPlaces(places, { category: 'food', visited: 'visited' }, visits)).toEqual([]);
  });

  it('changes nothing when neither chip is set', () => {
    expect(filterSavedPlaces(places, { category: 'all', visited: 'all' }, visits)).toHaveLength(4);
  });
});
