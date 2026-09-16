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
  if (end && day > end) return 'post';
  // Inside the dates, or only one end known and not yet past it.
  if (start && day >= start) return 'during';
  return 'pre';
};

/** Today in the traveller's own timezone, as YYYY-MM-DD. */
export const localToday = (now: Date = new Date()): string => {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
