import { describe, expect, it } from 'vitest';
import { elsewhereLabel, savedElsewhere } from './savedElsewhere';
import { SavedTravelInspiration } from '../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

/*
  「我在新莊的旅冊中 我也有收藏該地點的收藏 但顯示不出來」 — and the panel
  said 「你的 8 個收藏都在別的目的地（台灣 8）」 on a trip in 台灣.

  The caller was handing `trip.destination` — a district — to a parameter named
  `destinationCountry`, so 「新莊」 was compared against 「台灣」 and lost. Eight
  other call sites in that same component pass `travelCountry`; this one line
  did not. The sentence is wrong under every answer to how the collection
  should be scoped, which is why it is its own fix.
*/
describe('a district is not a country', () => {
  it('counts nothing as elsewhere when the saves are in the trip country', () => {
    expect(savedElsewhere([saved('台灣', 'a'), saved('台灣', 'b')], '台灣')).toEqual([]);
  });

  /*
    The function was never the bug, and a test of the function alone proves
    nothing — the first version of this block passed with the defect still in
    place. The caller was handing a DISTRICT to a parameter named
    `destinationCountry`, and the only way to catch that is to read the call.

    Eight other sites in that component write `destinationCountry ||
    travelCountry`. This asserts there is no ninth spelling, so the next person
    cannot reintroduce it quietly.
  */
  it('is never called with a trip destination where a country belongs', () => {
    const planner = readFileSync(
      resolve(__dirname, '../components/TripInspirationPlanner.tsx'),
      'utf8',
    );
    const calls = planner.match(/savedElsewhere\([^)]*\)/g) ?? [];

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toContain('trip.destination)');
      expect(call).toContain('trip.travelCountry');
    }
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
