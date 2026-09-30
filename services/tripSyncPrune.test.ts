/**
 * The push must not delete the other traveller's expense.
 *
 * Reported from the trip: one phone's records appeared on the other, and not
 * the reverse. The visible half was the read happening once. The dangerous
 * half is here — the push deleted every row not in the list it was sending,
 * so the second phone saving its own expense removed the first phone's from
 * the server.
 *
 * Exercised through pushTripSnapshot rather than the pure helper, because the
 * defect was in which query got built, and a test of the helper alone would
 * have passed against the broken version.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deletes: Array<{ table: string; op: 'in' | 'notIn'; ids: string[] }> = [];

vi.mock('./supabaseClient', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      upsert: () => Promise.resolve({ error: null }),
      select: () => Promise.resolve({ data: [], error: null }),
      delete: () => self(),
      eq: () => self(),
      in: (_column: string, ids: string[]) => {
        deletes.push({ table, op: 'in', ids });
        return Promise.resolve({ error: null });
      },
      not: (_column: string, _operator: string, list: string) => {
        deletes.push({ table, op: 'notIn', ids: [list] });
        return Promise.resolve({ error: null });
      },
    });
    return chain;
  };
  return { supabase: { from: builder }, supabaseConfigured: true };
});

const { pushTripSnapshot } = await import('./tripSync');

const expense = (id: string) => ({
  id, description: 'x', amount: 1, currency: 'KRW', category: 'FOOD',
  date: '2026-10-03', paidBy: 'me', splitWith: [], phase: 'during',
}) as never;

const snapshot = (ids: string[]) => ({
  members: [], expenses: ids.map(expense), itinerary: [], flightAnchors: [],
});

beforeEach(() => { deletes.length = 0; });

const expenseDeletes = () => deletes.filter(entry => entry.table === 'expenses');

describe('pushing from a device that has not re-read', () => {
  it('does not delete an expense it has never seen', async () => {
    // B knows only its own expense. A's 'a-1' reached the server after B's
    // last read, so it is absent from B's list for a reason that is not
    // deletion.
    await pushTripSnapshot(snapshot(['b-1']), 'trip', {
      expenses: new Set(['b-1']), itinerary: new Set(), flightAnchors: new Set(),
    });

    expect(expenseDeletes()).toEqual([]);
  });

  it('deletes nothing at all when the caller passes no knowledge', async () => {
    // The safe direction for any caller not yet taught to track this.
    await pushTripSnapshot(snapshot(['b-1']), 'trip');

    expect(expenseDeletes()).toEqual([]);
  });
});

describe('deletions the traveller actually made', () => {
  it('still reach the server', async () => {
    // Otherwise a cancelled charge comes back on the next person to open the
    // trip, which is worse than losing one: nobody is looking for it.
    await pushTripSnapshot(snapshot(['a-1']), 'trip', {
      expenses: new Set(['a-1', 'a-2']), itinerary: new Set(), flightAnchors: new Set(),
    });

    expect(expenseDeletes()).toEqual([{ table: 'expenses', op: 'in', ids: ['a-2'] }]);
  });

  it('never uses the delete-everything-else form', async () => {
    // The shape of the old query is the bug. A `not in (...)` on this table
    // deletes rows belonging to whoever else is on the trip.
    await pushTripSnapshot(snapshot(['a-1']), 'trip', {
      expenses: new Set(['a-1', 'a-2']), itinerary: new Set(), flightAnchors: new Set(),
    });

    expect(deletes.every(entry => entry.op === 'in')).toBe(true);
  });
});
