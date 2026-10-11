import { Phase } from '../types';

/**
 * Which part of a trip today falls in.
 *
 * The overview used to make the traveller pick this from a row of tabs, which
 * asks them to tell the app something it already knows: the trip has dates.
 * Someone opening Trippie on day three wants today, not a choice.
 *
 * Dates are compared as plain YYYY-MM-DD strings in the traveller's own local
 * day. A trip is "during" on both its first and last day — the last day is
 * still the trip, not the aftermath.
 */

/** One day later, as YYYY-MM-DD. UTC maths on a date-only string cannot drift. */
const dayAfter = (date: string): string => {
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time)) return date;
  return new Date(time + 86400000).toISOString().slice(0, 10);
};

export const phaseForDate = (
  today: string,
  startDate?: string,
  endDate?: string,
): Phase | null => {
  const day = (today || '').slice(0, 10);
  const start = (startDate || '').slice(0, 10);
  const end = (endDate || '').slice(0, 10);
  if (!day || (!start && !end)) return null;

  if (start && day < start) return 'pre';
  if (end && day > end) {
    /*
      'post' had no end, so a trip stayed 返程中 forever.

      「目前旅程都已經完成了」 — 釜山 ended 10/07 and the workspace still said
      RETURN 返程中 on 10/10, while the home screen called the same trip
      已結束的旅程. One trip saying two things on two screens is worse than
      either being wrong, because now neither can be trusted.

      'post' is 回國機場消費 — the journey home, and the spending that happens
      on it. That is the day after the last day of the trip, and then it is
      done. After that the trip is 結算: the whole ledger, which is what
      somebody opening a finished trip came for.
    */
    return day > dayAfter(end) ? 'summary' : 'post';
  }
  // Inside the dates, or only one end known and not yet past it.
  if (start && day >= start) return 'during';
  return 'pre';
};

/**
 * Today in the traveller's own timezone, as YYYY-MM-DD.
 *
 * Re-exported so existing callers keep working, but it is one implementation
 * now: this was the only place that got local dates right, and five other
 * call sites each rewrote it and each shifted a day.
 */
export { localToday } from './localDate';
