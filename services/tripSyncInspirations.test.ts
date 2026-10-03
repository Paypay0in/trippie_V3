/**
 * A place saved twice must land, not vanish.
 *
 * 「我剛重新上傳一次 資訊會重複紀錄 … 剛剛有接到解析出資訊，一按存檔就變沒有東西呀」.
 *
 * The second upload minted a new id for a place the shared list already held.
 * Uniqueness there is on the place, so the upsert was an insert the database
 * refused — and the refusal was reported as a successful save, so the new
 * places in that batch disappeared with no error anybody could see.
 *
 * Exercised through pushTripSnapshot rather than the pure helper, because the
 * defect was in which rows the query carried and how its error was handled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Recorded { table: string; rows: Array<{ id: string; place_name: string }> }

const upserts: Recorded[] = [];
let existingRows: Array<{ id: string; place_id: string | null; place_name: string }> = [];
let upsertError: { code?: string; message: string } | null = null;

vi.mock('./supabaseClient', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    const read = Promise.resolve({ data: existingRows, error: null });
    Object.assign(chain, {
      upsert: (rows: Recorded['rows']) => {
        upserts.push({ table, rows });
        return Promise.resolve({ error: table === 'trip_inspirations' ? upsertError : null });
      },
      select: () => self(),
      delete: () => self(),
      order: () => read,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      eq: () => (table === 'trip_inspirations' ? read : self()),
      in: () => Promise.resolve({ error: null }),
      not: () => Promise.resolve({ error: null }),
      then: (resolve: (value: unknown) => unknown) => read.then(resolve),
    });
    return chain;
  };
  return { supabase: { from: builder }, supabaseConfigured: true };
});

const { pushTripSnapshot } = await import('./tripSync');

const inspiration = (id: string, placeName: string) => ({
  id,
  savedByUserId: 'north',
  country: '韓國',
  city: '釜山',
  placeName,
  sourcePostId: 'screenshot:a',
  sourceSliceId: 'screenshot:a',
  sourceCreatorId: 'north',
  sourceNoteIds: [],
  savedAt: '2026-10-03T09:00:00.000Z',
  notes: [],
}) as never;

const snapshot = (inspirations: unknown[]) => ({
  members: [], expenses: [], itinerary: [], flightAnchors: [], inspirations,
}) as never;

const inspirationUpserts = () => upserts.filter(entry => entry.table === 'trip_inspirations');

beforeEach(() => {
  upserts.length = 0;
  existingRows = [];
  upsertError = null;
});

describe('pushing the want-to-go list', () => {
  it('writes a re-saved place onto the row the server already has', async () => {
    existingRows = [{ id: 'remote-1', place_id: null, place_name: '味贊王鹽烤肉' }];

    await pushTripSnapshot(snapshot([inspiration('local-new', '味贊王鹽烤肉')]), 'trip');

    expect(inspirationUpserts()[0].rows.map(row => row.id)).toEqual(['remote-1']);
  });

  it('still carries the places that are genuinely new', async () => {
    existingRows = [{ id: 'remote-1', place_id: null, place_name: '味贊王鹽烤肉' }];

    await pushTripSnapshot(
      snapshot([inspiration('local-a', '味贊王鹽烤肉'), inspiration('local-b', 'Peak square')]),
      'trip',
    );

    expect(inspirationUpserts()[0].rows.map(row => row.place_name)).toEqual([
      '味贊王鹽烤肉',
      'Peak square',
    ]);
  });

  it('reports a rejected save as a failure instead of a success', async () => {
    // A unique violation means the places never landed. Answering 'ok' here is
    // what left his collection empty with nothing to explain it.
    upsertError = { code: '23505', message: 'duplicate key value' };

    const result = await pushTripSnapshot(snapshot([inspiration('a', 'Peak square')]), 'trip');

    expect(result.status).toBe('error');
  });

  it('still tolerates a database without the table yet', async () => {
    upsertError = { code: '42P01', message: 'relation "trip_inspirations" does not exist' };

    const result = await pushTripSnapshot(snapshot([inspiration('a', 'Peak square')]), 'trip');

    expect(result.status).toBe('ok');
  });
});
