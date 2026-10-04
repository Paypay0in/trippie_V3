/**
 * Calendar dates in the traveller's own timezone.
 *
 * A trip date is a calendar day, not an instant. The bug this module exists to
 * end is the one shape that keeps reappearing:
 *
 *     new Date(`${isoDate}T00:00:00`).toISOString().slice(0, 10)
 *
 * The constructor reads local midnight; `toISOString` then converts to UTC. East
 * of Greenwich that lands on the previous day, so a trip entered as 10/02–10/07
 * drew its day tabs as 10/01–10/06 — every day on the itinerary off by one,
 * while the server, which parses with an explicit `Z`, had the dates right.
 *
 * Everything here stays in local calendar space and never round-trips through
 * UTC. `localToday` already did this correctly in tripPhaseByDate; the other
 * five call sites each re-derived it and each got it wrong, so it lives in one
 * place now.
 */

/** A calendar date as YYYY-MM-DD, read in local time. */
export const toLocalIsoDate = (date: Date): string => {
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Today where the traveller is standing, as YYYY-MM-DD. */
export const localToday = (now: Date = new Date()): string => toLocalIsoDate(now);

/**
 * Local midnight on an ISO date, or an invalid Date if the input is not one.
 * Parsing without a zone suffix is deliberate: it is what keeps the value in
 * the traveller's calendar rather than shifting it into UTC.
 */
export const fromLocalIsoDate = (isoDate: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T00:00:00`) : new Date(NaN);

/** Adds whole days to an ISO date, staying on the local calendar. */
export const addLocalDays = (isoDate: string, days: number): string => {
  const date = fromLocalIsoDate(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
};

/**
 * Every calendar day from start to end inclusive.
 *
 * Stepping by calendar day rather than by 86,400,000 ms matters: adding a fixed
 * day of milliseconds across a daylight-saving boundary lands on 23:00 the
 * previous day, and the date silently repeats.
 */
export const enumerateLocalDates = (startDate: string, endDate: string, limit = 366): string[] => {
  const cursor = fromLocalIsoDate(startDate);
  const end = fromLocalIsoDate(endDate);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || end < cursor) return [];
  const dates: string[] = [];
  while (cursor <= end && dates.length < limit) {
    dates.push(toLocalIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

/**
 * The day an itinerary should open on.
 *
 * 「比方說今日已經 day 3 打開行程表的時候 預設就不要再從 day1 開始」. Opening on the
 * first day is right exactly once — before the trip starts. On the third
 * morning it means two taps before the screen says anything about today, every
 * single time the app is opened.
 *
 * Before the trip: the first day, which is the one being planned. After it: the
 * last, because that is where the trip ended and where its final notes are.
 */
export const defaultItineraryDate = (dates: string[], now: Date = new Date()): string | undefined => {
  if (dates.length === 0) return undefined;
  const today = localToday(now);
  if (dates.includes(today)) return today;
  return today < dates[0] ? dates[0] : dates[dates.length - 1];
};
