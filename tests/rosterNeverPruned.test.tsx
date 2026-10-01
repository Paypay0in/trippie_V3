/**
 * Nobody loses a trip to a background push.
 *
 * The roster is not a list any one device owns. A seat is created on the server
 * when an invite is claimed, and the device holding the trip has not read it
 * yet — so "delete the seats I know about but am not holding" deleted the
 * person who had just joined, from the owner's device, minutes later, silently.
 * The owner is the one role the policy allows to do it.
 *
 * It happened two days before a real trip: she accepted at 10:34, his device
 * pushed at 10:36, and from then on the server refused every expense she
 * recorded. Her ledger lived on her phone and nowhere else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pushMembers } from '../services/tripSync';
import type { TripMember } from '../types';

const owner: TripMember = { id: 'trip-1:owner', name: 'Ann', type: 'owner', userId: 'account-ann' };

/** Records what the push actually asked the database to do. */
const deletes: string[][] = [];
const upserts: unknown[][] = [];

vi.mock('../services/supabaseClient', () => {
  const builder = (table: string) => ({
    upsert: (rows: unknown[]) => { upserts.push(rows); return Promise.resolve({ error: null }); },
    delete: () => ({
      eq: () => ({
        in: (_column: string, ids: string[]) => { deletes.push(ids); return Promise.resolve({ error: null }); },
      }),
    }),
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    __table: table,
  });
  return { supabase: { from: (table: string) => builder(table) }, supabaseConfigured: true };
});

afterEach(() => {
  deletes.length = 0;
  upserts.length = 0;
});

describe('pushing the roster', () => {
  it('never deletes a seat, even one it believes it knows about', async () => {
    // The owner's device holds only itself; the server also has the member who
    // joined by invite a moment ago.
    const result = await pushMembers([owner], 'trip-1', ['trip-1:owner', 'member-gina']);

    expect(result.status).toBe('ok');
    expect(deletes).toEqual([]);
    expect(upserts).toHaveLength(1);
  });

  it('still writes the roster it is holding', async () => {
    const gina: TripMember = { id: 'member-gina', name: 'Gina', type: 'member', userId: 'account-gina' };

    await pushMembers([owner, gina], 'trip-1', []);

    expect(upserts[0]).toHaveLength(2);
    expect(deletes).toEqual([]);
  });
});
