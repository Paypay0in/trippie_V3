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

/** Keyed by itinerary item id, or by a place key — see `placeJournalKey`. */
export type JournalsByItem = Record<string, Journal>;

/**
 * A journal that belongs to a place rather than to a stop on a plan.
 *
 * 「這家店是分帳 因此我沒有原始帳目的紀錄 我就就不能傳圖跟做備注」. At a meal
 * somebody else paid for, the bill is theirs and cannot be written on — and
 * if the place was never on the itinerary there was nothing at all to attach
 * a memory to. This is that missing hook.
 *
 * The same table, deliberately. `item_id` has no foreign key and the row is
 * already author-only, so a place key needs no new store and no migration —
 * and 「my private record of being somewhere」 is one idea, which should have
 * one home. A second table would be the duplication this codebase keeps
 * paying for.
 */
export const PLACE_JOURNAL_PREFIX = 'place:';

export const placeJournalKey = (placeKey: string): string =>
  `${PLACE_JOURNAL_PREFIX}${placeKey.trim()}`;

export const isPlaceJournalKey = (key: string): boolean =>
  key.startsWith(PLACE_JOURNAL_PREFIX);

/**
 * Journals a place carries, across every trip and none.
 *
 * `trip_id` is empty for these: a place is not a trip, and pretending one is
 * would file the memory under a journey it may not belong to.
 */
export const PLACE_JOURNAL_TRIP_ID = '';

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
 * Every journal this account has written against a place.
 *
 * Fetched by author rather than by trip, because a place journal belongs to
 * nobody's itinerary. The row policy is `author_id = auth.uid()`, so this
 * cannot read anybody else's however it asks.
 */
export const fetchPlaceJournals = async (): Promise<SyncResult<JournalsByItem>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('itinerary_journals')
      .select('item_id,text,photos')
      .like('item_id', `${PLACE_JOURNAL_PREFIX}%`);
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
  input: {
    tripId: string;
    itemId: string;
    authorId: string;
    text: string;
    /**
     * The traveller's own photographs.
     *
     * The column has existed since `0030` and nothing ever wrote to it: the
     * reader filled `photos` faithfully and every writer dropped them, so a
     * journal could show pictures it had no way of acquiring. Half a feature
     * is worse than none, because it reads as a bug in whoever used it.
     */
    photos?: string[];
  },
): Promise<SyncResult<null>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const text = input.text.trim();
    const photos = (input.photos ?? []).filter(shot => typeof shot === 'string' && shot.trim());
    /* Emptied means deleted — and emptied means neither words nor pictures. */
    if (!text && photos.length === 0) {
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
        photos: photos.length > 0 ? photos : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'item_id,author_id' });
    if (error) throw error;
    return { status: 'ok', data: null };
  } catch (error) {
    return { status: 'error', message: describe(error) };
  }
};
