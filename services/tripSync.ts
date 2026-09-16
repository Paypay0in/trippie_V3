import { Expense, TripMember } from '../types';
import { supabase, supabaseConfigured } from './supabaseClient';
import {
  ExpenseRow,
  TripMemberRow,
  fromExpenseRow,
  fromMemberRow,
  toExpenseRow,
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

/** Everything this trip holds remotely. Absent tables or no access read as an error, not as an empty trip. */
export const fetchTripSnapshot = async (
  tripId: string,
): Promise<SyncResult<TripSyncSnapshot>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const [members, expenses] = await Promise.all([
      supabase.from('trip_members').select('*').eq('trip_id', tripId),
      supabase.from('expenses').select('*').eq('trip_id', tripId),
    ]);
    if (members.error) throw members.error;
    if (expenses.error) throw expenses.error;

    return {
      status: 'ok',
      data: {
        members: (members.data as TripMemberRow[]).map(fromMemberRow),
        expenses: (expenses.data as ExpenseRow[]).map(fromExpenseRow),
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

/** First upload of a trip that has only ever existed on this device. */
export const pushTripSnapshot = async (
  { members, expenses }: TripSyncSnapshot,
  tripId: string,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const memberResult = await pushMembers(members, tripId);
    if (memberResult.status === 'error') return memberResult;

    if (expenses.length) {
      const { error } = await supabase
        .from('expenses')
        .upsert(expenses.map(expense => toExpenseRow(expense, tripId)), { onConflict: 'id' });
      if (error) throw error;
    }
    return { status: 'ok', data: null };
  } catch (error) {
    return failed(error);
  }
};
