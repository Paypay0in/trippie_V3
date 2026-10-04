import { Expense, FlightAnchor, ItineraryItem, SavedTravelInspiration, TripMember } from '../types';
import { idsToPrune } from './syncPrune';
import { changedRows, RowFingerprints, withFingerprints } from './rowFingerprints';
import type { SharedTaxRule } from './sharedTaxRule';
import { supabase, supabaseConfigured } from './supabaseClient';
import {
  ExpenseRow,
  FlightAnchorRow,
  TripInspirationRow,
  ItineraryItemRow,
  TripMemberRow,
  fromExpenseRow,
  fromFlightAnchorRow,
  fromTripInspirationRow,
  fromItineraryRow,
  fromMemberRow,
  toExpenseRow,
  toFlightAnchorRow,
  toTripInspirationRow,
  toItineraryRow,
  toMemberRow,
  alignInspirationRowIds,
} from './tripSyncMapping';

/**
 * A table this deployment's database has not been given yet.
 *
 * Postgres answers `42P01` for an undefined table, and PostgREST `PGRST205`
 * when its schema cache has never seen one. Code reaches a deployment before a
 * migration reaches a database, so that window has to be survivable — but it is
 * the only error that may be mistaken for success.
 */
const isMissingTable = (error: { code?: string; message?: string }): boolean =>
  error?.code === '42P01'
  || error?.code === 'PGRST205'
  || /does not exist|schema cache/i.test(error?.message || '');

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

/** Rows this device has read or written, and may therefore delete. */
export interface KnownRemoteIds {
  members?: Iterable<string>;
  expenses: Iterable<string>;
  itinerary: Iterable<string>;
  flightAnchors: Iterable<string>;
  /** Optional while the table is newer than some deployed clients. */
  inspirations?: Iterable<string>;
  /**
   * What the server is believed to hold, row by row.
   *
   * 「Gina打開就覆蓋掉我們剛剛更新的資料了」 — without this every open republished
   * the whole trip, so the device that opened last decided what every row said.
   * Rows whose fingerprint still matches are not sent at all.
   */
  fingerprints?: RowFingerprints;
}

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
   * The trip's want-to-go list, shared like everything else on it.
   *
   * 「跟朋友會先把想去的地方列一個表單」 — it lived in one browser's localStorage,
   * so the one thing it was for was the one thing it could not do. Optional
   * because a client built before migration 0011 sends a snapshot without it,
   * and a missing list must never be read as an emptied one.
   */
  inspirations?: SavedTravelInspiration[];
  /**
   * The destination's tax-refund rule, so both travellers get an estimate.
   *
   * 「Gina的介面無法看到退稅資訊」 — it lived on the local draft, so whoever ran
   * the research was the only person with a refund card that worked. Only the
   * tax rule travels: entry rules depend on whose passport it is.
   */
  taxRule?: SharedTaxRule;
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

/** What a push leaves behind: the server's contents, as this push addressed them. */
export interface PushOutcome {
  fingerprints: RowFingerprints;
}

export type SyncResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/** Sync needs both a configured project and a signed-in user; RLS sees no one otherwise. */
export const isSyncAvailable = (): boolean => supabaseConfigured && supabase !== null;

/**
 * What went wrong, in words.
 *
 * A PostgrestError is a plain object, not an Error, so `String(error)` on it
 * produced 「寫入：[object Object]」 — which is what the traveller whose expenses
 * were being refused actually saw, on the one screen built to tell her why.
 * Supabase puts the useful part in `message`, with `code`/`details` behind it.
 */
const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const fields = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [fields.message, fields.details, fields.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    const code = typeof fields.code === 'string' && fields.code.trim() ? `（${fields.code}）` : '';
    if (parts.length > 0) return `${parts.join(' · ')}${code}`;
    if (code) return `資料庫錯誤${code}`;
    try { return JSON.stringify(error); } catch { return '未知錯誤'; }
  }
  return String(error);
};

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: describeError(error),
});

export interface TripRowBootstrap {
  /** True only when this call inserted the trip row for the first time. */
  created: boolean;
}

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
}): Promise<SyncResult<TripRowBootstrap>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    // Read before inserting so the caller can tell two very different empty
    // snapshots apart: a brand-new cloud row must publish the local draft,
    // while an existing cloud trip whose lists are empty must clear stale
    // local data. Upsert cannot report that distinction reliably.
    const { data: existing, error: readError } = await supabase
      .from('trips')
      .select('id')
      .eq('id', tripId)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return { status: 'ok', data: { created: false } };

    const { error } = await supabase.from('trips').insert(
      {
        id: tripId,
        owner_id: ownerUserId,
        name,
        destination: destination ?? null,
        start_date: startDate ?? null,
        end_date: endDate ?? null,
        currency: currency ?? null,
      },
    );
    if (error) throw error;
    return { status: 'ok', data: { created: true } };
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
  /** The account that owns the trip, which is not always the one reading it. */
  ownerId?: string;
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
      /*
        `owner_id` is read because whose trip it is cannot be inferred locally.

        Without it a trip pulled from the cloud arrived ownerless, and the app
        filled the gap with the account doing the pulling — so on the second
        traveller's phone she was the owner of his 釜山. Her settlement then had
        nobody to owe, and his bills offered her an edit button, because every
        permission question answered 「you are the owner」.
      */
      .select('id,name,destination,start_date,end_date,currency,owner_id');
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
        ownerId: (row.owner_id as string) ?? undefined,
      })),
    };
  } catch (error) {
    return failed(error);
  }
};

/**
 * Everything this trip holds remotely.
 *
 * For members, expenses and the itinerary, an absent table or no access reads
 * as an error rather than as an empty trip — answering "you have nothing" to a
 * question we could not ask is how a device wipes a ledger it never read.
 * Flights are the one exception, and the comment below says why.
 */
export const fetchTripSnapshot = async (
  tripId: string,
): Promise<SyncResult<TripSyncSnapshot>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    // Ordered by id, which is stable and means nothing beyond being the same
    // every time. Without it Postgres answers in heap order, which moves after
    // any update — so a re-read handed the app the same trip in a new order
    // every twenty seconds, and anything watching the list for changes saw one
    // that had not happened.
    const [members, expenses, itinerary, flights, inspirations, taxRule] = await Promise.all([
      supabase.from('trip_members').select('*').eq('trip_id', tripId).order('id'),
      supabase.from('expenses').select('*').eq('trip_id', tripId).order('id'),
      supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('id'),
      supabase.from('flight_anchors').select('*').eq('trip_id', tripId).order('id'),
      supabase.from('trip_inspirations').select('*').eq('trip_id', tripId).order('id'),
      supabase.from('trip_tax_rules').select('*').eq('trip_id', tripId).maybeSingle(),
    ]);
    if (members.error) throw members.error;
    if (expenses.error) throw expenses.error;
    if (itinerary.error) throw itinerary.error;

    // Flights degrade on their own rather than failing the read.
    //
    // This table arrives in migration 0007, and code reaches a deployment
    // before a migration reaches a database — there is always a window. Letting
    // a missing table throw here would abort the whole snapshot, so the money
    // and the plan would stop syncing too, over a table nobody had created yet.
    // Losing the flights for that window is a visible gap; losing the ledger is
    // a silent one.
    if (flights.error && import.meta.env.DEV) {
      console.warn('[tripSync] flight anchors unavailable', flights.error.message);
    }
    // Same reasoning for the want-to-go list, which arrives in migration 0011.
    if (inspirations.error && import.meta.env.DEV) {
      console.warn('[tripSync] trip inspirations unavailable', inspirations.error.message);
    }
    // And for the shared tax rule, which arrives in migration 0012.
    if (taxRule.error && import.meta.env.DEV) {
      console.warn('[tripSync] trip tax rule unavailable', taxRule.error.message);
    }

    return {
      status: 'ok',
      data: {
        members: (members.data as TripMemberRow[]).map(fromMemberRow),
        expenses: (expenses.data as ExpenseRow[]).map(fromExpenseRow),
        itinerary: (itinerary.data as ItineraryItemRow[]).map(fromItineraryRow),
        flightAnchors: flights.error
          ? []
          : (flights.data as FlightAnchorRow[]).map(fromFlightAnchorRow),
        // Undefined, not empty: a table that is not there yet has said nothing
        // about this trip's list, and the caller must not treat that as 「清空」.
        inspirations: inspirations.error
          ? undefined
          : (inspirations.data as TripInspirationRow[]).map(fromTripInspirationRow),
        taxRule: taxRule.error || !taxRule.data
          ? undefined
          : {
              rule: (taxRule.data as Record<string, unknown>).rule as SharedTaxRule['rule'],
              ruleSource: ((taxRule.data as Record<string, unknown>).rule_source as string) ?? undefined,
              destination: ((taxRule.data as Record<string, unknown>).destination as string) ?? undefined,
              fetchedAt: ((taxRule.data as Record<string, unknown>).fetched_at as string) ?? undefined,
            },
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
  /**
   * Accepted and ignored.
   *
   * A push no longer removes anybody from a trip. The roster is not a list this
   * device owns: a seat is created on the server when an invite is claimed, and
   * the device that holds the trip has not read it yet. Pruning "seats I know
   * about but am not holding" therefore deleted the person who had just joined
   * — from the owner's device, minutes later, silently, which is the one role
   * the policy lets do it.
   *
   * It happened on a real trip two days before departure: she accepted the
   * invite at 10:34, the owner's device pushed at 10:36, and from then on every
   * expense she recorded was refused by the server and lived only on her phone.
   * Losing someone's access is not a sync detail; taking a traveller off a trip
   * has to be something a person does on purpose.
   */
  _knownMemberIds?: Iterable<string>,
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    if (members.length) {
      // `defaultToNull: false` is what keeps the seat's account attached.
      //
      // The roster this device holds is the one it was given when the trip was
      // created; it does not know that an invite has since been claimed. Writing
      // it back with the usual upsert set every unsent column to NULL, so each
      // push quietly cleared `user_id` on the seat that had just been linked —
      // and `user_id` is the whole of what RLS checks. She lost the trip again
      // within minutes of every invite, four times, with nothing to see.
      //
      // Columns this device has no opinion about now keep whatever the server
      // already holds.
      const { error } = await supabase
        .from('trip_members')
        .upsert(members.map(member => toMemberRow(member, tripId)), {
          onConflict: 'id',
          defaultToNull: false,
        });
      if (error) throw error;
    }
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
  { members, expenses, itinerary, flightAnchors, inspirations, taxRule }: TripSyncSnapshot,
  tripId: string,
  /**
   * What this device knows exists on the server: everything it has read or
   * written. Only these may be deleted.
   *
   * Without it the prune below deleted every row not in this push, which on a
   * second phone means deleting the other traveller's expenses — they are
   * missing from the list because this device never re-read, not because
   * anyone removed them. Omitted, nothing is pruned at all, which is the safe
   * direction for a caller that has not been taught this yet.
   */
  known?: KnownRemoteIds,
): Promise<SyncResult<PushOutcome>> => {
  if (!supabase) return { status: 'unavailable' };
  /*
    What the server holds after this push, as the push itself addressed it.

    Reported back rather than recomputed by the caller, because the caller
    cannot know the ids used: saved places are re-addressed to the server's own
    row ids on the way out, so a fingerprint recorded against the local id never
    matches again and every open rewrites all twenty rows — which is exactly
    what the database showed after the first attempt at this fix.
  */
  let written: RowFingerprints = { ...(known?.fingerprints || {}) };
  const done = (): SyncResult<PushOutcome> => ({ status: 'ok', data: { fingerprints: written } });
  try {
    // A member who is not the owner is refused by the roster policy. That must
    // not stop their expenses from being written — losing someone's record of
    // what they paid is a far worse failure than a stale roster.
    await pushMembers(members, tripId, known?.members);

    /*
      Only the expenses this device actually changed.

      An unchanged row rewritten is not harmless: it overwrites whatever the
      other traveller saved in the seconds since this device last read.
    */
    const expenseRows = changedRows('expenses', expenses.map(expense => toExpenseRow(expense, tripId)), known?.fingerprints);
    if (expenseRows.length) {
      const { error } = await supabase
        .from('expenses')
        .upsert(expenseRows, { onConflict: 'id' });
      if (error) throw error;
    }
    written = withFingerprints(written, 'expenses', expenses.map(expense => toExpenseRow(expense, tripId)));

    const removedExpenses = idsToPrune(known?.expenses ?? [], expenses.map(expense => expense.id));
    if (removedExpenses.length) {
      const { error: pruneError } = await supabase
        .from('expenses')
        .delete()
        .eq('trip_id', tripId)
        .in('id', removedExpenses);
      if (pruneError) throw pruneError;
    }

    // Same shape as the expense write above: upsert what is here, then remove
    // what is not. Deleting a day's plan has to reach the other phone too, or
    // the two people are following different itineraries and only one of them
    // knows it.
    const itineraryRows = changedRows('itinerary_items', itinerary.map(item => toItineraryRow(item, tripId)), known?.fingerprints);
    if (itineraryRows.length) {
      const { error } = await supabase
        .from('itinerary_items')
        .upsert(itineraryRows, { onConflict: 'id' });
      if (error) throw error;
    }
    written = withFingerprints(written, 'itinerary_items', itinerary.map(item => toItineraryRow(item, tripId)));

    const removedItems = idsToPrune(known?.itinerary ?? [], itinerary.map(item => item.id));
    if (removedItems.length) {
      const { error: itineraryPruneError } = await supabase
        .from('itinerary_items')
        .delete()
        .eq('trip_id', tripId)
        .in('id', removedItems);
      if (itineraryPruneError) throw itineraryPruneError;
    }

    // Upsert on the leg rather than the id: re-entering the outbound flight
    // produces a fresh anchor id locally, and keying on id alone would leave
    // the old departure sitting in the shared trip beside the new one.
    //
    // Written last, and allowed to fail on its own, for the same reason the
    // read tolerates a missing table: until 0007 is applied there is nowhere to
    // put these, and that must not mark a write as failed when the expenses and
    // the itinerary both landed.
    if (flightAnchors.length) {
      const { error } = await supabase
        .from('flight_anchors')
        .upsert(flightAnchors.map(anchor => toFlightAnchorRow(anchor, tripId)), {
          onConflict: 'trip_id,direction',
        });
      if (error) {
        if (import.meta.env.DEV) console.warn('[tripSync] flight anchors not written', error.message);
        return done();
      }
    }

    const removedAnchors = idsToPrune(known?.flightAnchors ?? [], flightAnchors.map(anchor => anchor.id));
    if (removedAnchors.length) {
      const { error: flightPruneError } = await supabase
        .from('flight_anchors')
        .delete()
        .eq('trip_id', tripId)
        .in('id', removedAnchors);
      if (flightPruneError && import.meta.env.DEV) {
        console.warn('[tripSync] flight anchors not pruned', flightPruneError.message);
      }
    }

    /*
      The want-to-go list.

      Written only when the caller actually sent one: `undefined` means a client
      that predates this table, and treating that as an empty list would have it
      prune the other traveller's saves on every push.

      Upsert on the place rather than the id, matching the unique index. Two
      phones minting their own ids for the same restaurant is the normal case
      — 「也要可以檢查是否重複」 — and keying on id alone would leave both on the
      shared list.

      Allowed to fail on its own for the same reason the flights are: until 0011
      is applied there is nowhere to put these, and that must not mark a write
      as failed when the ledger and the itinerary both landed.
    */
    if (inspirations?.length) {
      /*
        The ids on the server decide which rows these are.

        Uniqueness here is on the place, not on the id — two phones, or the same
        phone uploading a screenshot twice, mint different ids for one
        restaurant. Sending a new id for a place that already has a row is an
        insert, and the place index refuses it, taking every other place in the
        same batch down with it.
      */
      const existing = await supabase
        .from('trip_inspirations')
        .select('id,place_id,place_name')
        .eq('trip_id', tripId);
      if (existing.error && !isMissingTable(existing.error)) throw existing.error;

      const aligned = alignInspirationRowIds(
        inspirations.map(entry => toTripInspirationRow(entry, tripId)),
        (existing.data as Pick<TripInspirationRow, 'id' | 'place_id' | 'place_name'>[] | null) ?? [],
      );
      /*
        Fingerprints are compared after the ids are aligned, because a row only
        matches the server's copy once it is addressed by the server's id.
      */
      const rows = changedRows('trip_inspirations', aligned, known?.fingerprints);
      // Recorded against the aligned ids, which are the ids the server uses.
      written = withFingerprints(written, 'trip_inspirations', aligned);

      /*
        Nothing to write is not nothing to do.

        「一直出現」 — 打車 10 分鐘 kept coming back after being deleted, because
        this returned early when no row had changed. Deleting one place leaves
        every other place identical, which is exactly that case, so the prune
        below never ran and the row stayed on the server for the next read to
        bring back.
      */
      const { error } = rows.length === 0
        ? { error: null }
        : await supabase
          .from('trip_inspirations')
          .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
      /*
        Only a table that does not exist yet is tolerated.

        That is the one failure this client can be sure is harmless: 0011 has
        not been applied to this database. Every other error means a save the
        traveller watched succeed did not happen, and reporting it as a success
        is how a list of places came back empty with nothing to explain it.
      */
      if (error) {
        if (!isMissingTable(error)) throw error;
        if (import.meta.env.DEV) console.warn('[tripSync] inspirations table missing', error.message);
        return done();
      }
    }

    if (inspirations) {
      const removedInspirations = idsToPrune(known?.inspirations ?? [], inspirations.map(entry => entry.id));
      if (removedInspirations.length) {
        const { error: inspirationPruneError } = await supabase
          .from('trip_inspirations')
          .delete()
          .eq('trip_id', tripId)
          .in('id', removedInspirations);
        if (inspirationPruneError && import.meta.env.DEV) {
          console.warn('[tripSync] inspirations not pruned', inspirationPruneError.message);
        }
      }
    }

    /*
      The destination's tax rule, written by whoever researched it.

      One row per trip, so a second traveller running the research updates the
      same answer rather than adding a competing one. Never pruned: a rule
      nobody has re-researched is still the rule.

      Allowed to fail on its own, like the two writes above it — the table
      arrives in migration 0012, and code reaches a deployment first.
    */
    if (taxRule?.rule?.numericRule) {
      const { error } = await supabase
        .from('trip_tax_rules')
        .upsert({
          trip_id: tripId,
          rule: taxRule.rule,
          rule_source: taxRule.ruleSource ?? null,
          destination: taxRule.destination ?? null,
          fetched_at: taxRule.fetchedAt ?? null,
        }, { onConflict: 'trip_id' });
      if (error && import.meta.env.DEV) {
        console.warn('[tripSync] tax rule not written', error.message);
      }
    }


    return done();
  } catch (error) {
    return failed(error);
  }
};
