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
      eq: () => (table === 'trip_inspirations' ? read : self()),
      in: () => Promise.resolve({ error: null }),
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

beforeEach(() => { upserts.length = 0; existingInspirationRows = []; });

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
