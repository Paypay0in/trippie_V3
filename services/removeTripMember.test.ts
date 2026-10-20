import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 「這本東京帳冊 我已經刪掉『諮』了 怎麼還出現」.
 *
 * Removing a companion was local only. `pushMembers` deliberately never prunes
 * — pruning once deleted a traveller minutes after she claimed her invite, and
 * every expense she recorded afterwards was refused by the server — so the
 * seat stayed in `trip_members` and the next read put her back, because the
 * remote roster is taken wholesale.
 *
 * That comment's own conclusion is this function: taking somebody off a trip
 * has to be something a person does on purpose. A push is not that; a tap on
 * 移除 is.
 */
const database = vi.hoisted(() => ({
  deletes: [] as Array<Record<string, string>>,
  returns: [] as Array<{ id: string }>,
  error: null as null | { message: string },
}));

vi.mock('./supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      if (table !== 'trip_members') throw new Error(`Unexpected table ${table}`);
      const filters: Record<string, string> = {};
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        delete: () => builder,
        eq: (column: string, value: string) => { filters[column] = value; return builder; },
        select: () => {
          database.deletes.push({ ...filters });
          return Promise.resolve({ data: database.returns, error: database.error });
        },
      });
      return builder;
    },
  },
}));

const { removeTripMember } = await import('./tripSync');

beforeEach(() => {
  database.deletes.length = 0;
  database.returns = [];
  database.error = null;
});

describe('removeTripMember', () => {
  it('deletes that seat on that trip, and nobody else\'s', async () => {
    database.returns = [{ id: 'seat-gina' }];

    await expect(removeTripMember('tokyo', 'seat-gina'))
      .resolves.toEqual({ status: 'ok', data: { removed: 1 } });
    expect(database.deletes).toEqual([{ trip_id: 'tokyo', id: 'seat-gina' }]);
  });

  /*
    Zero rows is not an error and is not success either. `trip_members_write`
    belongs to the trip's owner, and a delete matching nothing reports nothing
    — so a member tapping 移除 would have watched the name vanish and come
    back. The caller has to be able to tell.
  */
  it('reports removing nothing, rather than calling it done', async () => {
    database.returns = [];

    await expect(removeTripMember('tokyo', 'seat-gina'))
      .resolves.toEqual({ status: 'ok', data: { removed: 0 } });
  });

  it('reports a refusal in words', async () => {
    database.error = { message: 'new row violates row-level security policy' };

    await expect(removeTripMember('tokyo', 'seat-gina')).resolves.toEqual({
      status: 'error',
      message: 'new row violates row-level security policy',
    });
  });
});
