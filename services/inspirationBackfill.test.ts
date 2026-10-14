/**
 * 「拉麵店為何還是顯示為一區」, 「日本・日本」, and a whole country of notes under one
 * card — one gap, three symptoms.
 *
 * Those places were saved before the save path looked anything up, so they
 * carry a name and nothing else: no address to read a district out of, and no
 * city to group by.
 */
import { describe, expect, it } from 'vitest';
import { knowsWhereItIs, placesNeedingBackfill } from './inspirationBackfill';
import { SavedTravelInspiration } from '../types';

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: 'me',
  placeName: 'らぁ麺や 嶋',
  country: '日本',
  city: '日本',
  notes: [],
  ...over,
} as SavedTravelInspiration);

describe('whether a saved place knows where it is', () => {
  it('knows when it has an address and a real city', () => {
    expect(knowsWhereItIs(saved({ formattedAddress: '東京都渋谷区本町3-41-11', city: 'Shibuya' }))).toBe(true);
  });

  /** The exact shape the old save path produced. */
  it('does not count a city that is its own country', () => {
    expect(knowsWhereItIs(saved({ formattedAddress: '東京都…', city: '日本' }))).toBe(false);
  });

  it('does not count a missing address', () => {
    expect(knowsWhereItIs(saved({ city: 'Shibuya' }))).toBe(false);
  });

  it('ignores case and spacing on that comparison', () => {
    expect(knowsWhereItIs(saved({ formattedAddress: 'x', country: 'Japan', city: ' japan ' }))).toBe(false);
  });
});

describe('what to look up', () => {
  it('lists only the ones still missing something', () => {
    const gaps = placesNeedingBackfill([
      saved({ id: 'a', placeName: '嶋' }),
      saved({ id: 'b', placeName: 'HARRY', formattedAddress: '…', city: 'Taito City' }),
    ]);

    expect(gaps.map(gap => gap.placeName)).toEqual(['嶋']);
  });

  /** Two rows for one restaurant must not spend two requests. */
  it('groups rows of the same place into one lookup', () => {
    const gaps = placesNeedingBackfill([
      saved({ id: 'a', placeName: '嶋' }),
      saved({ id: 'b', placeName: '嶋' }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].inspirationIds.sort()).toEqual(['a', 'b']);
  });

  /** Nothing to search for. */
  it('skips a save with no name at all', () => {
    expect(placesNeedingBackfill([saved({ placeName: '   ' })])).toHaveLength(0);
  });

  it('says nothing when every save already knows', () => {
    expect(placesNeedingBackfill([
      saved({ formattedAddress: '…', city: 'Shibuya' }),
    ])).toHaveLength(0);
  });
});
