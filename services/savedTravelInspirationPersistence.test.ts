/**
 * @vitest-environment jsdom
 *
 * 「標籤出現又消失」.
 *
 * This loader rebuilds every saved place field by field out of localStorage,
 * and whatever its whitelist does not name is dropped. Three fields added to
 * the record after it was written fell straight through it, so they were
 * erased on every page load — signed in or not, and whatever the sync, the
 * merge and the grouping did about it:
 *
 *   補齊 writes 餐廳 → the chip appears
 *   reload           → the loader rebuilds the record without it → gone
 *
 * It is also why an area heading kept reverting to the place name (`district`)
 * and why 補齊 never finished counting down (`placeResolvedAt`, so every record
 * looked unasked again on the next load).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY,
  loadSavedTravelInspirations,
  saveSavedTravelInspirations,
} from './savedTravelInspirationPersistence';
import { SavedTravelInspiration } from '../types';

afterEach(() => localStorage.clear());

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: 'north',
  country: '日本',
  city: 'Tokyo',
  placeName: 'らぁ麺や 嶋',
  sourcePostId: 's',
  sourceSliceId: 's',
  sourceCreatorId: 'north',
  sourceNoteIds: [],
  savedAt: '2026-10-14T09:00:00.000Z',
  notes: [],
  ...over,
}) as SavedTravelInspiration;

const roundTrip = (item: SavedTravelInspiration) => {
  saveSavedTravelInspirations([item]);
  return loadSavedTravelInspirations()[0];
};

describe('a saved place, written and read back', () => {
  it('still knows its tag, its ward and when it was looked up', () => {
    const read = roundTrip(saved({
      category: 'food',
      district: 'Shibuya',
      placeResolvedAt: '2026-10-14T10:00:00.000Z',
    }));

    expect(read.category).toBe('food');
    expect(read.district).toBe('Shibuya');
    expect(read.placeResolvedAt).toBe('2026-10-14T10:00:00.000Z');
  });

  /* 「other」 is 「asked, and there was no answer」; losing it restarts 補齊. */
  it('keeps 「other」, which is what stops the backfill asking again', () => {
    expect(roundTrip(saved({ category: 'other' })).category).toBe('other');
  });

  it('leaves a record that never had them alone', () => {
    const read = roundTrip(saved());

    expect(read.category).toBeUndefined();
    expect(read.district).toBeUndefined();
  });

  /*
    Validated rather than trusted, like every other field here: a hand-edited
    store must not be able to put an arbitrary string into a typed field.
  */
  it('refuses a category that is not one of the tags', () => {
    localStorage.setItem(
      SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY,
      JSON.stringify([{ ...saved(), category: 'restaurant' }]),
    );

    expect(loadSavedTravelInspirations()[0].category).toBeUndefined();
  });
});

/**
 * The same whitelist, and the same way of dying.
 *
 * `sources` records who recommended a place when more than one person did. A
 * field this loader does not name is erased on reload — so without these the
 * second recommendation would survive the merge and then be deleted by the
 * next page load, which is the 🏷️ bug wearing different clothes.
 */
describe('who recommended this place', () => {
  it('survives a reload', () => {
    const read = roundTrip(saved({
      sources: [
        { sourceType: 'post', sourceId: 'post-ann', sourceItemId: 'slice-ann', sourceCreatorId: 'ann', firstSeenAt: '2026-10-02T00:00:00.000Z' },
        { sourceType: 'post', sourceId: 'post-bob', sourceCreatorId: 'bob' },
      ],
    }));

    expect(read.sources?.map(entry => entry.sourceCreatorId)).toEqual(['ann', 'bob']);
    expect(read.sources?.[0].sourceItemId).toBe('slice-ann');
    expect(read.sources?.[1].sourceItemId).toBeUndefined();
  });

  /* A record written before the field existed stays exactly as it was. */
  it('is absent on a record that never had it', () => {
    expect(roundTrip(saved()).sources).toBeUndefined();
  });

  /* Validated rather than trusted, like every other field here. */
  it('drops an entry with no source to point at', () => {
    localStorage.setItem(
      SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY,
      JSON.stringify([{ ...saved(), sources: [{ sourceType: 'post' }, null, 'nonsense'] }]),
    );

    expect(loadSavedTravelInspirations()[0].sources).toEqual([]);
  });
});
