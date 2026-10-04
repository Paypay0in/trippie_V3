/**
 * 「Gina打開就覆蓋掉我們剛剛更新的資料了」.
 *
 * Opening the trip republished everything the device was holding — 19 saved
 * places, every itinerary item, every expense, all stamped in the same second.
 * Most of the time that is invisible, because both phones hold the same thing.
 * It stops being invisible the moment one of them is a few seconds behind: the
 * older copy is written over the newer one and nobody deleted anything.
 *
 * Exercised through pushTripSnapshot rather than the helper, because the defect
 * was in what the request carried.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Recorded { table: string; ids: string[] }

const upserts: Recorded[] = [];
const deletes: Array<{ table: string; ids: string[] }> = [];
let existingInspirationRows: Array<{ id: string; place_id: string | null; place_name: string }> = [];

vi.mock('./supabaseClient', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    const read = Promise.resolve({ data: existingInspirationRows, error: null });
    Object.assign(chain, {
      upsert: (rows: Array<{ id: string }>) => {
        upserts.push({ table, ids: rows.map(row => row.id) });
        return Promise.resolve({ error: null });
      },
      select: () => self(),
      delete: () => self(),
      order: () => read,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      /*
        Both chainable and awaitable.

        The read is `.select().eq()` and awaits there; the delete is
        `.delete().eq().in()` and carries on. An `eq` that returned the read
        promise broke the delete chain silently — which is how the first version
        of this test passed while the delete never ran.
      */
      eq: () => self(),
      then: table === 'trip_inspirations'
        ? (resolve: (value: unknown) => unknown) => read.then(resolve)
        : undefined,
      in: (_column: string, ids: string[]) => {
        deletes.push({ table, ids });
        return Promise.resolve({ error: null });
      },
      not: () => Promise.resolve({ error: null }),
    });
    return chain;
  };
  return { supabase: { from: builder }, supabaseConfigured: true };
});

const { pushTripSnapshot } = await import('./tripSync');
const { withFingerprints } = await import('./rowFingerprints');
const { toExpenseRow, toItineraryRow } = await import('./tripSyncMapping');

const expense = (id: string, amount: number) => ({
  id, description: id, amount, currency: 'KRW', exchangeRate: 0.023, handlingFee: 0,
  twdAmount: amount * 0.023, category: '購物', paymentMethod: 'CREDIT_CARD', phase: 'during',
  date: '2026-10-03', payerId: 'me', payerAllocations: { me: amount }, beneficiaries: [],
  splitMethod: 'EQUAL', splitAllocations: {}, disputes: [], needsReview: false, receiptPhotos: [],
}) as never;

const item = (id: string, time: string) => ({
  id, date: '2026-10-05', time, title: id, location: id, notes: '', type: 'ACTIVITY',
}) as never;

const snapshot = (expenses: unknown[], itinerary: unknown[] = []) => ({
  members: [], expenses, itinerary, flightAnchors: [],
}) as never;

const idsFor = (table: string): string[] => upserts.filter(entry => entry.table === table).flatMap(entry => entry.ids);

beforeEach(() => { upserts.length = 0; deletes.length = 0; existingInspirationRows = []; });

describe('opening a trip that has not changed', () => {
  it('writes nothing at all', async () => {
    const expenses = [expense('e-1', 18000), expense('e-2', 30000)];
    const itinerary = [item('it-1', '10:00')];
    const fingerprints = withFingerprints(
      withFingerprints(undefined, 'expenses', expenses.map(entry => toExpenseRow(entry, 'trip'))),
      'itinerary_items',
      itinerary.map(entry => toItineraryRow(entry, 'trip')),
    );

    await pushTripSnapshot(snapshot(expenses, itinerary), 'trip', {
      expenses: new Set(['e-1', 'e-2']), itinerary: new Set(['it-1']), flightAnchors: new Set(), fingerprints,
    });

    expect(upserts).toEqual([]);
  });

  it('still writes the one row that did change', async () => {
    const before = [expense('e-1', 18000), expense('e-2', 30000)];
    const fingerprints = withFingerprints(undefined, 'expenses', before.map(entry => toExpenseRow(entry, 'trip')));

    // The lipstick was corrected to its refunded price; the other bill was not
    // touched, so it must not be rewritten over whatever she just saved.
    await pushTripSnapshot(snapshot([expense('e-1', 16920), before[1]]), 'trip', {
      expenses: new Set(['e-1', 'e-2']), itinerary: new Set(), flightAnchors: new Set(), fingerprints,
    });

    expect(idsFor('expenses')).toEqual(['e-1']);
  });

  it('writes a record the server has never seen', async () => {
    // No fingerprint means this device has never seen it on the server, and
    // withholding it is how an expense stays on one phone forever.
    const known = withFingerprints(undefined, 'expenses', [toExpenseRow(expense('e-1', 18000), 'trip')]);

    await pushTripSnapshot(snapshot([expense('e-1', 18000), expense('e-new', 5000)]), 'trip', {
      expenses: new Set(['e-1']), itinerary: new Set(), flightAnchors: new Set(), fingerprints: known,
    });

    expect(idsFor('expenses')).toEqual(['e-new']);
  });

  it('writes everything when this device knows nothing yet', async () => {
    // A client with no fingerprints behaves as it always did, which is the safe
    // direction: publishing too much beats publishing nothing.
    await pushTripSnapshot(snapshot([expense('e-1', 18000)]), 'trip', {
      expenses: new Set(), itinerary: new Set(), flightAnchors: new Set(),
    });

    expect(idsFor('expenses')).toEqual(['e-1']);
  });
});

describe('the want-to-go list on open', () => {
  const place = (id: string, name: string, notes: unknown[] = []) => ({
    id, savedByUserId: 'north', country: '韓國', city: '釜山', placeName: name,
    sourcePostId: 'screenshot:a', sourceSliceId: 'screenshot:a', sourceCreatorId: 'north',
    sourceNoteIds: [], savedAt: '2026-10-03T09:00:00.000Z', notes,
  }) as never;

  it('does not restamp all nineteen rows', async () => {
    const { toTripInspirationRow } = await import('./tripSyncMapping');
    const places = [place('i-1', '味贊王鹽烤肉'), place('i-2', 'Peak square')];
    const fingerprints = withFingerprints(undefined, 'trip_inspirations', places.map(entry => toTripInspirationRow(entry, 'trip')));

    await pushTripSnapshot(
      { members: [], expenses: [], itinerary: [], flightAnchors: [], inspirations: places } as never,
      'trip',
      { expenses: new Set(), itinerary: new Set(), flightAnchors: new Set(), fingerprints },
    );

    expect(idsFor('trip_inspirations')).toEqual([]);
  });
});

/**
 * The first attempt at this fix did not hold, and the database said so: all 20
 * saved places were rewritten again, in one second, minutes after it shipped.
 *
 * Saved places are re-addressed to the server's own row ids on the way out —
 * a re-upload mints a new local id for a place the shared list already has. A
 * fingerprint recorded against the local id therefore never matches the row the
 * next push builds, so every open rewrote the whole list exactly as before.
 */
describe('a saved place the server knows under another id', () => {
  const place = (id: string, name: string) => ({
    id, savedByUserId: 'north', country: '韓國', city: '釜山', placeName: name,
    sourcePostId: 'screenshot:a', sourceSliceId: 'screenshot:a', sourceCreatorId: 'north',
    sourceNoteIds: [], savedAt: '2026-10-03T09:00:00.000Z', notes: [],
  }) as never;

  const pushOnce = (fingerprints?: Record<string, string>) => pushTripSnapshot(
    { members: [], expenses: [], itinerary: [], flightAnchors: [], inspirations: [place('local-new', '味贊王鹽烤肉')] } as never,
    'trip',
    { expenses: new Set(), itinerary: new Set(), flightAnchors: new Set(), fingerprints },
  );

  it('reports what it wrote under the id it actually used', async () => {
    existingInspirationRows = [{ id: 'remote-1', place_id: null, place_name: '味贊王鹽烤肉' }];

    const result = await pushOnce();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(Object.keys(result.data.fingerprints)).toContain('trip_inspirations:remote-1');
    expect(Object.keys(result.data.fingerprints)).not.toContain('trip_inspirations:local-new');
  });

  it('does not write it again on the next open', async () => {
    existingInspirationRows = [{ id: 'remote-1', place_id: null, place_name: '味贊王鹽烤肉' }];
    const first = await pushOnce();
    if (first.status !== 'ok') throw new Error('expected a push');
    upserts.length = 0;

    await pushOnce(first.data.fingerprints);

    expect(idsFor('trip_inspirations')).toEqual([]);
  });
});

/**
 * 「一直出現」.
 *
 * 打車 10 分鐘 kept coming back after being deleted, and the database showed the
 * row still there. The no-republish guard returned early when no row had
 * changed — and deleting one place leaves every other place identical, which is
 * exactly that case. The prune after it never ran, so the row survived for the
 * next read to bring back.
 */
describe('a push that only deletes', () => {
  const place = (id: string, name: string) => ({
    id, savedByUserId: 'north', country: '韓國', city: '釜山', placeName: name,
    sourcePostId: 'screenshot:a', sourceSliceId: 'screenshot:a', sourceCreatorId: 'north',
    sourceNoteIds: [], savedAt: '2026-10-03T09:00:00.000Z', notes: [],
  }) as never;

  it('still deletes', async () => {
    const { toTripInspirationRow } = await import('./tripSyncMapping');
    const kept = place('i-keep', '味贊王鹽烤肉');
    const removed = place('i-junk', '打車 10 分鐘');
    const fingerprints = withFingerprints(
      undefined,
      'trip_inspirations',
      [kept, removed].map(entry => toTripInspirationRow(entry, 'trip')),
    );
    existingInspirationRows = [
      { id: 'i-keep', place_id: null, place_name: '味贊王鹽烤肉' },
      { id: 'i-junk', place_id: null, place_name: '打車 10 分鐘' },
    ];

    await pushTripSnapshot(
      { members: [], expenses: [], itinerary: [], flightAnchors: [], inspirations: [kept] } as never,
      'trip',
      {
        expenses: new Set(), itinerary: new Set(), flightAnchors: new Set(),
        inspirations: new Set(['i-keep', 'i-junk']), fingerprints,
      },
    );

    expect(deletes.filter(entry => entry.table === 'trip_inspirations')[0]?.ids).toEqual(['i-junk']);
  });

  it('writes nothing while doing it', async () => {
    // The place that stayed is unchanged, and rewriting it would overwrite
    // whatever the other traveller saved in the meantime.
    const { toTripInspirationRow } = await import('./tripSyncMapping');
    const kept = place('i-keep', '味贊王鹽烤肉');
    const fingerprints = withFingerprints(undefined, 'trip_inspirations', [toTripInspirationRow(kept, 'trip')]);
    existingInspirationRows = [{ id: 'i-keep', place_id: null, place_name: '味贊王鹽烤肉' }];

    await pushTripSnapshot(
      { members: [], expenses: [], itinerary: [], flightAnchors: [], inspirations: [kept] } as never,
      'trip',
      {
        expenses: new Set(), itinerary: new Set(), flightAnchors: new Set(),
        inspirations: new Set(['i-keep', 'i-junk']), fingerprints,
      },
    );

    expect(idsFor('trip_inspirations')).toEqual([]);
  });
});
