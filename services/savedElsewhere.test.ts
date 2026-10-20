import { describe, expect, it } from 'vitest';
import { elsewhereLabel, savedElsewhere } from './savedElsewhere';
import { SavedTravelInspiration } from '../types';

/**
 * 「我的旅行筆記都不見了」 — on a 墨西哥 trip, with 21 saved places in 韓國 and 日本.
 */
const saved = (country: string, id: string): SavedTravelInspiration => ({
  id, savedByUserId: 'me', placeName: 'x', country, city: '',
  notes: [], sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c',
  sourceNoteIds: [], savedAt: '2026-10-01T00:00:00.000Z',
} as SavedTravelInspiration);

const collection = [
  saved('韓國', 'a'), saved('韓國', 'b'), saved('韓國', 'c'), saved('日本', 'd'),
];

describe('savedElsewhere', () => {
  it('counts what belongs to other countries, most first', () => {
    expect(savedElsewhere(collection, '墨西哥')).toEqual([
      { country: '韓國', count: 3 },
      { country: '日本', count: 1 },
    ]);
  });

  /* 日本 and Japan are one place. See `countryIdentity`. */
  it('leaves out this destination however it is spelled', () => {
    expect(savedElsewhere(collection, 'Japan')).toEqual([{ country: '韓國', count: 3 }]);
  });

  it('says nothing when the collection really is empty', () => {
    expect(savedElsewhere([], '墨西哥')).toEqual([]);
  });

  it('says nothing when everything already belongs to this trip', () => {
    expect(savedElsewhere([saved('韓國', 'a')], '韓國')).toEqual([]);
  });

  it('ignores a saved place with no country on it', () => {
    expect(savedElsewhere([saved('', 'a'), saved('韓國', 'b')], '墨西哥'))
      .toEqual([{ country: '韓國', count: 1 }]);
  });

  /* Without a destination, everything is elsewhere — and that is the truth. */
  it('counts everything when the trip has no country yet', () => {
    expect(savedElsewhere(collection)).toEqual([
      { country: '韓國', count: 3 },
      { country: '日本', count: 1 },
    ]);
  });
});

describe('elsewhereLabel', () => {
  it('reads as a list somebody can scan', () => {
    expect(elsewhereLabel(savedElsewhere(collection, '墨西哥'))).toBe('韓國 3、日本 1');
  });

  it('is empty for an empty list', () => {
    expect(elsewhereLabel([])).toBe('');
  });
});
