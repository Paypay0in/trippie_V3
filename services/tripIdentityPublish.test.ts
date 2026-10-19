import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Publishing what a trip is called.
 *
 * `ensureTripRow` inserted a trip's name, destination and dates once and never
 * touched them again, so 「我把東京加他了」 reached nobody: the other phone kept
 * showing whatever the trip was called the day it was made. This is the write
 * that was missing — and it is the owner's alone, because `trips_update` is
 * `owner_id = auth.uid()` on both sides.
 */
const database = vi.hoisted(() => ({
  updates: [] as Array<{ row: Record<string, unknown>; id?: string }>,
  error: null as null | { message: string },
}));

vi.mock('./supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      if (table !== 'trips') throw new Error(`Unexpected table ${table}`);
      const pending: { row: Record<string, unknown>; id?: string } = { row: {} };
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        update: (row: Record<string, unknown>) => {
          pending.row = row;
          return builder;
        },
        eq: (_column: string, value: string) => {
          pending.id = value;
          database.updates.push(pending);
          return Promise.resolve({ error: database.error });
        },
      });
      return builder;
    },
  },
}));

const { updateTripIdentity } = await import('./tripSync');

beforeEach(() => {
  database.updates.length = 0;
  database.error = null;
});

describe('updateTripIdentity', () => {
  it('writes the name, destination and dates onto that trip', async () => {
    await expect(updateTripIdentity('trip-1', {
      name: '東京美食團',
      destination: '東京',
      startDate: '2026-10-20',
      endDate: '2026-10-24',
    })).resolves.toEqual({ status: 'ok', data: null });

    expect(database.updates).toEqual([{
      id: 'trip-1',
      row: {
        name: '東京美食團',
        destination: '東京',
        start_date: '2026-10-20',
        end_date: '2026-10-24',
      },
    }]);
  });

  /*
    Absent is written as null rather than left out: clearing a date has to
    reach the other phone too, and a partial update would leave the old one
    standing while this device showed none.
  */
  it('clears a date that is no longer set', async () => {
    await updateTripIdentity('trip-1', { name: '東京' });
    expect(database.updates[0].row).toEqual({
      name: '東京', destination: null, start_date: null, end_date: null,
    });
  });

  /* An absent currency is left alone, because a trip must always have one. */
  it('does not blank the currency when none was passed', async () => {
    await updateTripIdentity('trip-1', { name: '東京' });
    expect(database.updates[0].row).not.toHaveProperty('currency');
  });

  it('reports a refusal in words', async () => {
    database.error = { message: 'new row violates row-level security policy' };
    await expect(updateTripIdentity('trip-1', { name: '東京' })).resolves.toEqual({
      status: 'error',
      message: 'new row violates row-level security policy',
    });
  });
});
