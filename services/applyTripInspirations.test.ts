import { describe, expect, it } from 'vitest';
import { applyTripInspirations } from './applyTripInspirations';
import { mergeWithUnpushed } from './syncMerge';
import { SavedTravelInspiration } from '../types';

/**
 * 「這也刪掉過了又出現」.
 *
 * 「打車 10 分鐘」 was removed and came back. Expenses and the itinerary are
 * replaced by the server's copy on every read; saved places were merged into
 * the local ones instead — and a merge has no way to express a deletion. The
 * entry was gone from the server and still present locally, so it looked like
 * something the server had not heard about yet, and was published again.
 */

const place = (id: string, name: string, over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id,
  savedByUserId: 'north',
  country: '韓國',
  city: '韓國',
  placeName: name,
  sourcePostId: `screenshot:${id}`,
  sourceSliceId: `screenshot:${id}`,
  sourceCreatorId: 'north',
  sourceNoteIds: [],
  savedAt: '2026-10-03T09:00:00.000Z',
  notes: [],
  ...over,
}) as SavedTravelInspiration;

const korea = (inspiration: SavedTravelInspiration) => inspiration.country === '韓國';

describe('applyTripInspirations', () => {
  it('drops a place the server no longer has', () => {
    const current = [place('i-1', '味贊王鹽烤肉'), place('i-junk', '打車 10 分鐘')];

    const next = applyTripInspirations(current, [place('i-1', '味贊王鹽烤肉')], korea);

    expect(next.map(entry => entry.placeName)).toEqual(['味贊王鹽烤肉']);
  });

  it('leaves another trip’s places alone', () => {
    // The store spans every trip the traveller has ever saved a place for, and
    // a snapshot only knows about one of them.
    const current = [
      place('i-1', '味贊王鹽烤肉'),
      place('i-jp', '金閣寺', { country: '日本', city: '京都' }),
    ];

    const next = applyTripInspirations(current, [], korea);

    expect(next.map(entry => entry.placeName)).toEqual(['金閣寺']);
  });

  it('takes a place the other traveller added', () => {
    const next = applyTripInspirations([place('i-1', '味贊王鹽烤肉')], [
      place('i-1', '味贊王鹽烤肉'),
      place('i-2', 'Peak square'),
    ], korea);

    expect(next.map(entry => entry.placeName)).toEqual(['味贊王鹽烤肉', 'Peak square']);
  });

  it('keeps the order the reader is looking at', () => {
    const current = [place('i-1', 'A'), place('i-2', 'B'), place('i-3', 'C')];

    const next = applyTripInspirations(current, [place('i-3', 'C'), place('i-1', 'A'), place('i-2', 'B')], korea);

    expect(next.map(entry => entry.placeName)).toEqual(['A', 'B', 'C']);
  });

  it('still folds the same place saved twice', () => {
    const next = applyTripInspirations([], [
      place('i-1', 'Panier'),
      place('i-2', 'panier'),
    ], korea);

    expect(next).toHaveLength(1);
  });
});

/**
 * The deletion has to survive the other phone, which still holds the place.
 * That is what `known` is for: a record the server once had and no longer does
 * was deleted, while one it has never seen is simply not pushed yet.
 */
describe('a place deleted on the other phone', () => {
  it('goes from this one too', () => {
    const local = [place('i-1', '味贊王鹽烤肉'), place('i-junk', '打車 10 分鐘')];
    const seenOnServer = new Set(['i-1', 'i-junk']);

    const merged = mergeWithUnpushed(local, [place('i-1', '味贊王鹽烤肉')], seenOnServer);

    expect(applyTripInspirations(local, merged, korea).map(entry => entry.placeName))
      .toEqual(['味贊王鹽烤肉']);
  });

  it('does not take a place this device has not pushed yet', () => {
    // Never seen on the server is not the same as removed from it, and reading
    // them the same way is how a save disappears seconds after it is made.
    const local = [place('i-1', '味贊王鹽烤肉'), place('i-new', '剛剛存的店')];
    const seenOnServer = new Set(['i-1']);

    const merged = mergeWithUnpushed(local, [place('i-1', '味贊王鹽烤肉')], seenOnServer);

    expect(applyTripInspirations(local, merged, korea).map(entry => entry.placeName))
      .toEqual(['味贊王鹽烤肉', '剛剛存的店']);
  });
});
