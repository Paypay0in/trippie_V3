import { describe, expect, it } from 'vitest';
import { alignInspirationRowIds, TripInspirationRow } from './tripSyncMapping';

/**
 * 「我剛重新上傳一次 … 一按存檔就變沒有東西呀」.
 *
 * Saving the same screenshot again mints new local ids for places the shared
 * list already holds. The table's uniqueness is on the place, so an upsert
 * keyed on those new ids is an insert the database refuses — and it refuses the
 * whole batch, taking the genuinely new places down with it.
 */

const row = (over: Partial<TripInspirationRow>): TripInspirationRow => ({
  id: 'local-1',
  trip_id: 'trip-1',
  saved_by_user_id: 'north',
  place_name: '味贊王鹽烤肉',
  country: '韓國',
  city: '釜山',
  place_id: null,
  resolved_place_name: null,
  formatted_address: null,
  latitude: null,
  longitude: null,
  place_photo_url: null,
  source_post_id: 'screenshot:a',
  source_slice_id: 'screenshot:a',
  source_creator_id: 'north',
  source_note_ids: [],
  notes: [],
  saved_at: '2026-10-03T09:00:00.000Z',
  ...over,
});

describe('alignInspirationRowIds', () => {
  it('re-uses the id the server already has for that place', () => {
    const aligned = alignInspirationRowIds(
      [row({ id: 'local-new' })],
      [{ id: 'remote-1', place_id: null, place_name: '味贊王鹽烤肉' }],
    );
    expect(aligned).toHaveLength(1);
    expect(aligned[0].id).toBe('remote-1');
  });

  it('matches on the Google place id when both sides resolved one', () => {
    const aligned = alignInspirationRowIds(
      [row({ id: 'local-new', place_name: '味赞王盐烤肉', place_id: 'g-123' })],
      [{ id: 'remote-1', place_id: 'g-123', place_name: '味贊王鹽烤肉' }],
    );
    expect(aligned[0].id).toBe('remote-1');
  });

  it('matches a name however it was typed, as the index does', () => {
    const aligned = alignInspirationRowIds(
      [row({ id: 'local-new', place_name: '  panier ' })],
      [{ id: 'remote-1', place_id: null, place_name: 'Panier' }],
    );
    expect(aligned[0].id).toBe('remote-1');
  });

  it('does not fold two different places together', () => {
    const aligned = alignInspirationRowIds(
      [row({ id: 'a', place_name: '海雲台傳統市場' }), row({ id: 'b', place_name: 'Peak square' })],
      [],
    );
    expect(aligned.map(entry => entry.id)).toEqual(['a', 'b']);
  });

  it('folds a place that appears twice inside one batch', () => {
    const aligned = alignInspirationRowIds(
      [row({ id: 'a' }), row({ id: 'b' })],
      [],
    );
    expect(aligned).toHaveLength(1);
    expect(aligned[0].id).toBe('a');
  });

  it('leaves a genuinely new place with its own id', () => {
    const aligned = alignInspirationRowIds(
      [row({ id: 'local-new', place_name: 'Nasari Sigdang' })],
      [{ id: 'remote-1', place_id: null, place_name: '味贊王鹽烤肉' }],
    );
    expect(aligned[0].id).toBe('local-new');
  });
});
