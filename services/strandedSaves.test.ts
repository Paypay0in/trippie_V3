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
