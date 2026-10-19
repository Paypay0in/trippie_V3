import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  existing: null as null | Record<string, unknown>,
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('./supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      if (table !== 'trips') throw new Error(`Unexpected table ${table}`);
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: database.existing, error: null }),
        insert: (row: Record<string, unknown>) => {
          database.inserts.push(row);
          return Promise.resolve({ error: null });
        },
      });
      return builder;
    },
  },
}));

const { ensureTripRow } = await import('./tripSync');

const input = {
  tripId: 'trip-1',
  ownerUserId: 'user-1',
  name: '釜山',
};

beforeEach(() => {
  database.existing = null;
  database.inserts.length = 0;
});

describe('trip row bootstrap', () => {
  it('reports an existing visible trip without rewriting it', async () => {
    /*
      The row's own name comes back with it now, from the select that was
      already happening. 「我把東京加他了」 — a rename never left the device that
      made it, because nothing ever asked what the cloud called the trip.
    */
    database.existing = {
      id: 'trip-1',
      name: '釜山',
      destination: '釜山',
      start_date: '2026-10-02',
      end_date: '2026-10-06',
      owner_id: 'user-1',
    };

    await expect(ensureTripRow(input)).resolves.toEqual({
      status: 'ok',
      data: {
        created: false,
        identity: {
          name: '釜山',
          destination: '釜山',
          startDate: '2026-10-02',
          endDate: '2026-10-06',
          currency: undefined,
          ownerId: 'user-1',
        },
      },
    });
    expect(database.inserts).toEqual([]);
  });

  it('inserts and reports a new owner trip', async () => {
    await expect(ensureTripRow(input)).resolves.toEqual({ status: 'ok', data: { created: true } });
    expect(database.inserts).toEqual([
      expect.objectContaining({ id: 'trip-1', owner_id: 'user-1', name: '釜山' }),
    ]);
  });
});
