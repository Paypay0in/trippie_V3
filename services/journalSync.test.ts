/**
 * 「這家店是分帳 因此我沒有原始帳目的紀錄 我就就不能傳圖跟做備注」.
 *
 * At a meal somebody else paid for the bill is theirs and cannot be written
 * on, and where the place was never on the itinerary there was nothing at
 * all to attach a memory to. A journal keyed to a place is that hook — the
 * same table, because 「my private record of being somewhere」 is one idea
 * and should have one home.
 */
import { describe, expect, it } from 'vitest';
import {
  PLACE_JOURNAL_PREFIX,
  isPlaceJournalKey,
  placeJournalKey,
} from './journalSync';

describe('一則屬於地點的紀錄', () => {
  it('is keyed apart from an itinerary stop', () => {
    const key = placeJournalKey('ChIJ-ks-cafe');

    expect(key).toBe(`${PLACE_JOURNAL_PREFIX}ChIJ-ks-cafe`);
    expect(isPlaceJournalKey(key)).toBe(true);
  });

  /*
    A stop's id is a stop's id. The two live in one table and must never be
    mistaken for each other — a place journal appearing on an itinerary card
    would be the memory filed under the wrong evening.
  */
  it('is never mistaken for one', () => {
    expect(isPlaceJournalKey('i-1759-abc')).toBe(false);
    expect(isPlaceJournalKey('')).toBe(false);
  });

  it('trims what it is given', () => {
    expect(placeJournalKey('  ChIJ-x  ')).toBe(`${PLACE_JOURNAL_PREFIX}ChIJ-x`);
  });
});
