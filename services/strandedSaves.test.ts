/**
 * 「怎麼越弄越糟 我的釜山都不見了 還出現美國跟加拿大的」 — the records the broken
 * guard already damaged, found again.
 */
import { describe, expect, it } from 'vitest';
import { strandedSaves } from './strandedSaves';
import { SavedTravelInspiration } from '../types';

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: 'me',
  placeName: 'place',
  notes: [],
  ...over,
} as SavedTravelInspiration);

describe('saves in a country with no trip', () => {
  /* The measured damage: a note's title bound to a Vancouver business. */
  it('finds the Canadian binding among the Korean saves', () => {
    const found = strandedSaves([
      saved({ id: 'a', placeName: 'Photowave', country: '韓國', city: '釜山' }),
      saved({
        id: 'b',
        placeName: 'Global Work & Travel Canada',
        country: '加拿大',
        city: 'Vancouver',
      }),
    ], ['韓國']);

    expect(found.map(save => save.id)).toEqual(['b']);
    expect(found[0].country).toBe('加拿大');
  });

  /* The same country in another language is still a country he has a trip to. */
  it('does not strand a save whose country is spelled differently', () => {
    expect(strandedSaves(
      [saved({ country: 'Korea', city: 'Busan' })],
      ['韓國'],
    )).toEqual([]);
  });

  /*
    A save that never recorded a country is the backfill's job, not this one —
    it has not landed anywhere wrong, it simply has not landed.
  */
  it('ignores a save with no country', () => {
    expect(strandedSaves([saved({ country: '', city: '' })], ['韓國'])).toEqual([]);
  });

  /*
    With no trips to compare against everything looks stranded, and showing the
    whole collection as suspect is worse than showing nothing.
  */
  it('says nothing when there are no trips to compare against', () => {
    expect(strandedSaves([saved({ country: '加拿大' })], [])).toEqual([]);
  });
});

/**
 * 「這些不是都有對應收藏的了嗎 幹嘛顯示」 — twenty 釜山 saves, every one correctly
 * bound, listed as suspect because the 釜山 trip was still a draft.
 */
describe('a country the collection is plainly about', () => {
  const korean = (index: number) =>
    saved({ id: `k${index}`, placeName: `釜山 ${index}`, country: '韓國', city: 'Busan' });

  /* Twenty of them. Somebody with twenty Korean saves collects for Korea. */
  const collection = Array.from({ length: 20 }, (_, index) => korean(index));

  it('is not stranded, even with no trip to it at all', () => {
    expect(strandedSaves(collection, ['日本'])).toEqual([]);
  });

  /* And the damage still stands out beside it. */
  it('still finds the handful flung onto another continent', () => {
    const found = strandedSaves([
      ...collection,
      saved({ id: 'bad', placeName: 'Global Work & Travel Canada', country: '加拿大', city: 'Vancouver' }),
    ], ['日本']);

    expect(found.map(save => save.id)).toEqual(['bad']);
  });

  /*
    A share means nothing in a small collection, so there is a floor: four
    saves in one country is not yet a destination.
  */
  it('needs more than a handful before a country counts as collected for', () => {
    const four = Array.from({ length: 4 }, (_, index) => korean(index));

    expect(strandedSaves(four, ['日本']).map(save => save.id)).toHaveLength(4);
  });

  /* A country that is a small slice of a large collection is still flagged. */
  it('does not excuse a country that is a sliver of the collection', () => {
    const found = strandedSaves([
      ...collection,
      ...Array.from({ length: 5 }, (_, index) =>
        saved({ id: `c${index}`, placeName: `somewhere ${index}`, country: '加拿大', city: 'Vancouver' })),
    ], ['日本']);

    // Five Canadian saves against twenty Korean ones: under a quarter.
    expect(found).toHaveLength(5);
  });
});
