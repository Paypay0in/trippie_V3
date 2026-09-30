/**
 * Checking what the planner proposed before showing it as an option.
 *
 * The changes came back from the model and went straight to the screen. So an
 * `add` with a time but no date rendered as 「加到：未指定日期」 — a suggestion
 * the traveller asked to have scheduled, offered back unscheduled, with
 * nothing to do but accept it and then go find it.
 *
 * Nothing here guesses a date. A day is the one thing the request was for, and
 * inventing one would be worse than saying it is missing.
 */

export interface ProposedChange {
  type?: string;
  existingItemId?: string;
  toDate?: string;
  toTime?: string;
  proposedItem?: { placeName?: string };
  [key: string]: unknown;
}

export interface CheckedChanges {
  changes: ProposedChange[];
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const nameOf = (change: ProposedChange): string =>
  change.proposedItem?.placeName?.trim() || '一個新地點';

/**
 * Keeps the changes a traveller can actually act on.
 *
 * An `add` needs a day inside the trip. Without one it is dropped and named in
 * the warnings, so the answer is "this could not be placed" rather than a card
 * that looks accepted and then is not anywhere.
 *
 * `move` and `update` are left alone: they carry an existing item that already
 * has a date, and a missing `toDate` there means "keep the day it is on".
 */
export const checkProposedChanges = (
  raw: unknown,
  tripDates: string[],
): CheckedChanges => {
  const changes = Array.isArray(raw) ? (raw as ProposedChange[]) : [];
  const withinTrip = new Set(tripDates);
  const warnings: string[] = [];

  const kept = changes.filter(change => {
    if (change?.type !== 'add') return true;

    // A place is the entire content of an `add`. One came back with no
    // `proposedItem` at all and the place written into `toTime` as
    // 「22:45 N/A (Late Night Snack near Hotel)」 — a change that can only be
    // accepted into a card with no name on it.
    const placeName = change.proposedItem?.placeName?.trim() || '';
    if (!placeName) {
      warnings.push('有一筆新增建議沒有地點名稱，已略過。');
      return false;
    }

    const date = typeof change.toDate === 'string' ? change.toDate.trim() : '';
    if (!ISO_DATE.test(date)) {
      warnings.push(`${nameOf(change)} 沒有指定要排在哪一天，已略過。`);
      return false;
    }
    // A date outside the trip is not a day the traveller is there. Snapping it
    // to the nearest one would be a guess wearing a specific number.
    if (withinTrip.size > 0 && !withinTrip.has(date)) {
      warnings.push(`${nameOf(change)} 被排在旅程以外的 ${date}，已略過。`);
      return false;
    }
    return true;
  });

  return { changes: kept, warnings };
};
