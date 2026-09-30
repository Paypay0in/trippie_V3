import { Expense, FlightAnchor, ItineraryItem, TripMember } from '../types';
import { supabase, supabaseConfigured } from './supabaseClient';
import {
  ExpenseRow,
  FlightAnchorRow,
  ItineraryItemRow,
  TripMemberRow,
  fromExpenseRow,
  fromFlightAnchorRow,
  fromItineraryRow,
  fromMemberRow,
  toExpenseRow,
  toFlightAnchorRow,
  toItineraryRow,
  toMemberRow,
} from './tripSyncMapping';

/**
 * Reading and writing one trip's ledger to the shared tables.
 *
 * A first pass, deliberately: read the trip when it opens, write a record when
 * it changes, last write wins. A trip is edited by three people over a week —
 * not thirty at once — so conflict-free merge would be machinery paid for by
 * nobody.
 *
 * Every call fails soft. Sync is an addition to a ledger that already works
 * offline, so a network error must leave the local book usable rather than
 * blocking the person standing at a till.
 */

export interface TripSyncSnapshot {
  members: TripMember[];
  expenses: Expense[];
  /**
   * The itinerary, shared like everything else on the trip.
   *
   * Carried in the same snapshot rather than a parallel channel on purpose.
   * The read-before-write ordering that stops a freshly opened device from
   * erasing the remote ledger is enforced once, around this object; a second
   * path would need its own copy of that rule, and would eventually be missing
   * it.
   */
  itinerary: ItineraryItem[];
  /**
   * The flights the trip is arranged around.
   *
   * These were local-only while the itinerary items they derive did sync — so
   * a companion received "航班起飛" with no anchor behind it, and her device
   * then deleted those rows for both travellers. Carrying the anchors here
   * closes that gap, on the same read-before-write ordering as the rest.
   */
  flightAnchors: FlightAnchor[];
}

export type SyncResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/** Sync needs both a configured project and a signed-in user; RLS sees no one otherwise. */
export const isSyncAvailable = (): boolean => supabaseConfigured && supabase !== null;

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

/**
 * Create the trip row if this user has never pushed it.
 *
 * Only the owner may insert, which the policy enforces; a member joining an
 * existing trip simply finds it already there.
 */
export const ensureTripRow = async ({
  tripId,
  ownerUserId,
  name,
  destination,
  startDate,
  endDate,
  currency,
}: {
  tripId: string;
  ownerUserId: string;
  name: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
}): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('trips').upsert(
      {
        id: tripId,
        owner_id: ownerUserId,
        name,
        destination: destination ?? null,
        start_date: startDate ?? null,
        end_date: endDate ?? null,
        currency: currency ?? null,
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export interface RemoteTripSummary {
  id: string;
  name: string;
  destination?: string;
  startDate: string;
  endDate: string;
  currency?: string;
}

/**
 * Every trip this account can see.
 *
 * Without it, sync is invisible: trip ids are minted locally, so a second
 * browser signed into the same account holds entirely different trips and has
 * nothing to match against. Syncing a trip nobody can open proves nothing.
 */
export const fetchMyTrips = async (): Promise<SyncResult<RemoteTripSummary[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('trips')
      .select('id,name,destination,start_date,end_date,currency');
    if (error) throw error;
    return {
      status: 'ok',
      data: (data ?? []).map(row => ({
        id: row.id as string,
        name: (row.name as string) || '未命名旅程',
        destination: (row.destination as string) ?? undefined,
        startDate: (row.start_date as string) ?? '',
        endDate: (row.end_date as string) ?? '',
        currency: (row.currency as string) ?? undefined,
      })),
    };
  } catch (error) {
    return failed(error);
  }
};

/** Everything this trip holds remotely. Absent tables or no access read as an error, not as an empty trip. */
export const fetchTripSnapshot = async (
  tripId: string,
): Promise<SyncResult<TripSyncSnapshot>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const [members, expenses, itinerary, flights] = await Promise.all([
      supabase.from('trip_members').select('*').eq('trip_id', tripId),
      supabase.from('expenses').select('*').eq('trip_id', tripId),
      supabase.from('itinerary_items').select('*').eq('trip_id', tripId),
      supabase.from('flight_anchors').select('*').eq('trip_id', tripId),
    ]);
    if (members.error) throw members.error;
    if (expenses.error) throw expenses.error;
    if (itinerary.error) throw itinerary.error;
    if (flights.error) throw flights.error;

    return {
      status: 'ok',
      data: {
        members: (members.data as TripMemberRow[]).map(fromMemberRow),
        expenses: (expenses.data as ExpenseRow[]).map(fromExpenseRow),
        itinerary: (itinerary.data as ItineraryItemRow[]).map(fromItineraryRow),
        flightAnchors: (flights.data as FlightAnchorRow[]).map(fromFlightAnchorRow),
      },
    };
  } catch (error) {
    return failed(error);
  }
};

/** Write one expense. Used on create, edit, and every dispute mutation. */
export const pushExpense = async (
  expense: Expense,
  tripId: string,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase
      .from('expenses')
      .upsert(toExpenseRow(expense, tripId), { onConflict: 'id' });
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

export const deleteExpense = async (expenseId: string): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

/**
 * Replace the stored roster for a trip.
 *
 * Members are a small set the owner edits as a whole, so upserting the list and
 * removing what is no longer in it matches how the UI actually changes it.
 */
export const pushMembers = async (
  members: TripMember[],
  tripId: string,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    if (members.length) {
      const { error } = await supabase
        .from('trip_members')
        .upsert(members.map(member => toMemberRow(member, tripId)), { onConflict: 'id' });
      if (error) throw error;
    }
    const keep = members.map(member => member.id);
    const { error: pruneError } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .not('id', 'in', `(${keep.map(id => `"${id}"`).join(',') || '""'})`);
    if (pruneError) throw pruneError;
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};

/**
 * Push the whole ledger: upsert what is here, remove what is not.
 *
 * Deletion has to be part of the same operation. An upsert-only sync leaves a
 * deleted expense sitting on the server, and the next member to open the trip
 * silently gets it back — a resurrected charge is worse than a lost one,
 * because nobody is looking for it.
 */
export const pushTripSnapshot = async (
  { members, expenses, itinerary, flightAnchors }: TripSyncSnapshot,
  tripId: string,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    // A member who is not the owner is refused by the roster policy. That must
    // not stop their expenses from being written — losing someone's record of
    // what they paid is a far worse failure than a stale roster.
    await pushMembers(members, tripId);

    if (expenses.length) {
      const { error } = await supabase
        .from('expenses')
        .upsert(expenses.map(expense => toExpenseRow(expense, tripId)), { onConflict: 'id' });
      if (error) throw error;
    }

    const keep = expenses.map(expense => expense.id);
    const { error: pruneError } = await supabase
      .from('expenses')
      .delete()
      .eq('trip_id', tripId)
      .not('id', 'in', `(${keep.map(id => `"${id}"`).join(',') || '""'})`);
    if (pruneError) throw pruneError;

    // Same shape as the expense write above: upsert what is here, then remove
    // what is not. Deleting a day's plan has to reach the other phone too, or
    // the two people are following different itineraries and only one of them
    // knows it.
    if (itinerary.length) {
      const { error } = await supabase
        .from('itinerary_items')
        .upsert(itinerary.map(item => toItineraryRow(item, tripId)), { onConflict: 'id' });
      if (error) throw error;
    }

    const keepItems = itinerary.map(item => item.id);
    const { error: itineraryPruneError } = await supabase
      .from('itinerary_items')
      .delete()
      .eq('trip_id', tripId)
      .not('id', 'in', `(${keepItems.map(id => `"${id}"`).join(',') || '""'})`);
    if (itineraryPruneError) throw itineraryPruneError;

    // Upsert on the leg rather than the id: re-entering the outbound flight
    // produces a fresh anchor id locally, and keying on id alone would leave
    // the old departure sitting in the shared trip beside the new one.
    if (flightAnchors.length) {
      const { error } = await supabase
        .from('flight_anchors')
        .upsert(flightAnchors.map(anchor => toFlightAnchorRow(anchor, tripId)), {
          onConflict: 'trip_id,direction',
        });
      if (error) throw error;
    }

    const keepAnchors = flightAnchors.map(anchor => anchor.id);
    const { error: flightPruneError } = await supabase
      .from('flight_anchors')
      .delete()
      .eq('trip_id', tripId)
      .not('id', 'in', `(${keepAnchors.map(id => `"${id}"`).join(',') || '""'})`);
    if (flightPruneError) throw flightPruneError;

    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};
