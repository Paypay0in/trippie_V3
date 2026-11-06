import { Expense, ItineraryItem } from '../types';

/**
 * The columns that make a re-read expensive, and how a cheap read survives
 * without them.
 *
 * Measured 2026-11-05: the Supabase project held **0.04 GB** and had sent
 * **7.33 GB** in thirty days. The database was not large; it was downloaded
 * about a hundred and eighty times. `useTripSync` re-reads every twenty
 * seconds with `select('*')`, and two of those columns carry base64 image data
 * — `itinerary_items.photos` and `expenses.receipt_photos`. A tab left open on
 * one trip for an hour fetches every photo in it a hundred and eighty times.
 *
 * At one traveller that is a free-tier warning. At ten thousand it is the
 * largest line nobody had counted.
 *
 * So the periodic read stops asking for those columns. What it cannot do is
 * treat their absence as 「there are no photos」: this repo already has a scar
 * from that exact confusion — 「為什麼我點進去 上傳照片馬上就被刪掉了」 — and a
 * missing column is even less of a statement than an empty array is.
 *
 * Hence this module. A light read's rows are re-joined to the copies this
 * device already holds, and anything genuinely new is named so the caller can
 * fetch its photos deliberately, once, instead of fetching everyone's photos
 * forever.
 */

export interface HeavyFieldRestoration<T> {
  /** Rows safe to merge: light rows wearing the heavy values we already had. */
  rows: T[];
  /**
   * Ids the light read found that this device has never held.
   *
   * Their photos are genuinely unknown — not empty — so the caller fetches
   * those rows' heavy columns rather than publishing a record with its
   * pictures silently missing.
   */
  unknownIds: string[];
}

const restore = <T extends { id: string }>(
  light: T[],
  local: readonly T[],
  keys: (keyof T)[],
): HeavyFieldRestoration<T> => {
  const byId = new Map(local.map(row => [row.id, row]));
  const unknownIds: string[] = [];

  const rows = light.map(row => {
    const held = byId.get(row.id);
    if (!held) {
      unknownIds.push(row.id);
      return row;
    }
    const restored = { ...row };
    keys.forEach(key => {
      /*
        Copied whether or not the local value is empty. A light row's value for
        these keys carries no information at all — the column was never asked
        for — so the local copy is the only statement anybody made about them.
      */
      restored[key] = held[key];
    });
    return restored;
  });

  return { rows, unknownIds };
};

/** Itinerary photos, which the light read leaves behind. */
export const restoreItineraryPhotos = (
  light: ItineraryItem[],
  local: readonly ItineraryItem[],
): HeavyFieldRestoration<ItineraryItem> => restore(light, local, ['photos']);

/** Receipt images, same rule. */
export const restoreExpensePhotos = (
  light: Expense[],
  local: readonly Expense[],
): HeavyFieldRestoration<Expense> => restore(light, local, ['receiptPhotos']);
