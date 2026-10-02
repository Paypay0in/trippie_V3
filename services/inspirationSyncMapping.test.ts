/**
 * The want-to-go list, over the wire.
 *
 * 「收藏可以同步」. A round trip must change nothing: a place saved on one phone
 * and read back on the other is the same place, with the same notes and the
 * same address, or the shared list is worse than no shared list.
 */
import { describe, expect, it } from 'vitest';
import { fromTripInspirationRow, toTripInspirationRow, TripInspirationRow } from './tripSyncMapping';
import { SavedTravelInspiration } from '../types';

const inspiration: SavedTravelInspiration = {
  id: 'insp-1',
  savedByUserId: 'me',
  country: '韓國',
  city: '釜山',
  placeName: 'Panier',
  placeId: 'ChIJpanier',
  resolvedPlaceName: 'Panier',
  formattedAddress: '12 Seojeon-ro 57beon-gil, Busanjin District, Busan',
  latitude: 35.1557,
  longitude: 129.0588,
  placePhotoUrl: 'https://example.test/photo.jpg',
  sourcePostId: 'screenshot:shot-0',
  sourceSliceId: 'screenshot:shot-0',
  sourceCreatorId: 'me',
  sourceNoteIds: ['screenshot:shot-0:週一公休'],
  savedAt: '2026-10-02T09:00:00.000Z',
  notes: [{
    id: 'n1', sourceNoteId: 'screenshot:shot-0:週一公休', sourceSliceId: 'screenshot:shot-0',
    sourcePostId: 'screenshot:shot-0', sourceCreatorId: 'me', type: 'other', text: '週一公休',
  }],
};

describe('一來一回', () => {
  it('完整保留，包含地址、座標與筆記', () => {
    const round = fromTripInspirationRow(toTripInspirationRow(inspiration, 'trip-1'));

    expect(round).toEqual(inspiration);
  });

  it('掛在這趟旅程底下', () => {
    expect(toTripInspirationRow(inspiration, 'trip-1').trip_id).toBe('trip-1');
  });

  it('沒有地址的也存得進去，不會變成空字串假裝查到了', () => {
    const bare = { ...inspiration, placeId: undefined, formattedAddress: undefined, latitude: undefined, longitude: undefined };
    const row = toTripInspirationRow(bare, 'trip-1');

    expect(row.place_id).toBeNull();
    expect(row.formatted_address).toBeNull();
    expect(fromTripInspirationRow(row).placeId).toBeUndefined();
  });

  it('壞掉的筆記欄位不會讓整筆讀不出來', () => {
    const row = { ...toTripInspirationRow(inspiration, 'trip-1'), notes: '不是陣列', source_note_ids: null } as TripInspirationRow;

    const read = fromTripInspirationRow(row);

    expect(read.placeName).toBe('Panier');
    expect(read.notes).toEqual([]);
    expect(read.sourceNoteIds).toEqual([]);
  });
});
