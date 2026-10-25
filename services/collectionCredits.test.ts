/**
 * Turning the ids on a saved place into the line a person reads.
 *
 * The ids are what is stored, deliberately — §8 asks for stable lineage
 * rather than names, because a name changes and a name matches the wrong
 * person. These assert the one rule that keeps that honest: a credit is
 * given only where somebody else actually recommended the place.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { creditFor, forgetCredits } from './collectionCredits';
import { SavedTravelInspiration } from '../types';

const place = (patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1', savedByUserId: 'me', country: '日本', city: '東京',
  placeName: 'Onibus Coffee', sourcePostId: 'collection:c1', sourceSliceId: 'ci-1',
  sourceCreatorId: 'ann', sourceNoteIds: [], savedAt: '2026-03-10T00:00:00.000Z',
  notes: [], ...patch,
});

afterEach(forgetCredits);

describe('a place that came from somebody’s collection', () => {
  it('credits them, and remembers which collection', () => {
    const credit = creditFor(place());

    expect(credit?.collectionId).toBe('c1');
    expect(credit?.savedAt).toBe('2026-03-10T00:00:00.000Z');
  });

  /* Names are looked up; absent until they are, and never guessed. */
  it('offers no name it has not read', () => {
    expect(creditFor(place())).not.toHaveProperty('creatorName');
  });
});

describe('a place nobody recommended', () => {
  it('has no credit at all', () => {
    for (const marker of ['manual:g-1', 'screenshot:abc', '']) {
      expect(creditFor(place({ sourcePostId: marker }))).toBeUndefined();
    }
  });

  it('has none when the creator is missing too', () => {
    expect(creditFor(place({ sourceCreatorId: '  ' }))).toBeUndefined();
  });
});
