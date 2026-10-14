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

/**
 * 「有出現 但又消失了 沒有穩定存在」 / 「還是沒改呀」.
 *
 * `trip_inspirations` has no column for the 🏷️ tag, the ward, or the lookup
 * stamp, so the server's copy of a record always arrives without them.
 * Applying a snapshot wiped all three on every pull:
 *
 *   補齊 writes 餐廳 → the chip appears
 *   the next pull    → the server's copy has no category → the chip is gone
 *
 * forever, whatever the rendering did.
 */
describe('欄位資料庫還沒有的欄位', () => {
  const belongsToTrip = () => true;

  it('同步拉回來時不會把標籤、行政區、查詢時間洗掉', () => {
    const local = [place('a', 'らぁ麺や 嶋', {
      placeId: 'ChIJx',
      category: 'food',
      district: 'Shibuya',
      placeResolvedAt: '2026-10-14T10:00:00.000Z',
    })];
    // The server's copy: the same place, with no column for any of the three.
    const remote = [place('a', 'らぁ麺や 嶋', { placeId: 'ChIJx' })];

    const [applied] = applyTripInspirations(local, remote, belongsToTrip);

    expect(applied.category).toBe('food');
    expect(applied.district).toBe('Shibuya');
    expect(applied.placeResolvedAt).toBe('2026-10-14T10:00:00.000Z');
  });

  /* Matched on the place, not on the row id: the other phone saved it too. */
  it('另一支手機存的同一個地點也接得起來', () => {
    const local = [place('mine', '해운대', { placeId: 'ChIJy', category: 'sight' })];
    const remote = [place('theirs', '해운대', { placeId: 'ChIJy' })];

    expect(applyTripInspirations(local, remote, belongsToTrip)[0].category).toBe('sight');
  });

  /* A place the server has never heard of locally is left exactly as it came. */
  it('本機沒有的紀錄原樣帶進來', () => {
    const applied = applyTripInspirations([], [place('new', 'Levain')], belongsToTrip);

    expect(applied[0].category).toBeUndefined();
  });

  /* Once the column exists, the server wins — only the blank falls back. */
  it('伺服器真的有值時以伺服器為準', () => {
    const local = [place('a', 'x', { placeId: 'ChIJx', category: 'other' })];
    const remote = [place('a', 'x', { placeId: 'ChIJx', category: 'food' })];

    expect(applyTripInspirations(local, remote, belongsToTrip)[0].category).toBe('food');
  });
});
