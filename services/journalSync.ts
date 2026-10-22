/**
 * The traveller's private account of a stop.
 *
 * 「日記只給自己看」. The first version of this wrote into the itinerary item's
 * own `notes`, which syncs and which everybody on the trip reads — right for
 * 「幾點要出門」, and the opposite of what was asked for.
 *
 * So it has its own table, one row per person per stop, and the privacy is
 * enforced by `itinerary_journals_own` rather than by what this file remembers
 * to ask for: a rule a query can forget is not a rule. Every select here would
 * return the whole trip's journals if RLS were off, which is exactly why the
 * policy is where it is.
 *
 * Reads are per trip rather than per stop — a day has a dozen stops and twelve
 * round trips to show one screen is how a page comes to take four seconds.
 */
import { supabase } from './supabaseClient';
import type { SyncResult } from './tripSync';

export interface Journal {
  text: string;
  photos?: string[];
}

/** Keyed by itinerary item id. */
export type JournalsByItem = Record<string, Journal>;

interface JournalRow {
  item_id: string;
  text: string | null;
  photos: unknown;
}

const describe = (error: unknown): string => {
  const detail = error as { message?: string; code?: string } | null;
  return detail?.message || detail?.code || '不明的錯誤';
};

/**
 * Every journal this account has written on this trip.
 *
 * An empty result is 「nothing written」, which is the ordinary state and must
 * never be confused with 「could not read」 — the caller keeps what it had on
 * anything but `ok`.
 */
export const fetchTripJournals = async (
  tripId: string,
): Promise<SyncResult<JournalsByItem>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('itinerary_journals')
      .select('item_id,text,photos')
      .eq('trip_id', tripId);
    if (error) throw error;
    const journals: JournalsByItem = {};
    (data as JournalRow[] | null)?.forEach(row => {
      journals[row.item_id] = {
        text: row.text ?? '',
        ...(Array.isArray(row.photos)
          ? { photos: (row.photos as unknown[]).filter((shot): shot is string => typeof shot === 'string') }
          : {}),
      };
    });
    return { status: 'ok', data: journals };
  } catch (error) {
    return { status: 'error', message: describe(error) };
  }
};

/**
 * Writes one, or clears it.
 *
 * Emptied means deleted rather than stored as an empty string: a row that says
 * nothing is not a diary entry, and leaving it behind would make 「did I write
 * about this」 answer yes forever.
 */
export const saveJournal = async (
  input: { tripId: string; itemId: string; authorId: string; text: string },
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const text = input.text.trim();
    if (!text) {
      const { error } = await supabase
        .from('itinerary_journals')
        .delete()
        .eq('item_id', input.itemId)
        .eq('author_id', input.authorId);
      if (error) throw error;
      return { status: 'ok', data: null };
    }
    const { error } = await supabase
      .from('itinerary_journals')
      .upsert({
        item_id: input.itemId,
        author_id: input.authorId,
        trip_id: input.tripId,
        text,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'item_id,author_id' });
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return { status: 'error', message: describe(error) };
  }
};
