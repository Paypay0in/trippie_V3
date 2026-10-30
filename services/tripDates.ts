/**
 * The calendar days a trip covers.
 *
 * Split out of `itineraryPlanningService.ts` so that module can be translated
 * at all. `server.ts` imported it for this one function, which meant the whole
 * file was barred from importing `i18n/config` — react-i18next and a browser
 * language detector would have reached the server runtime whether the server
 * touched the translated code or not. Eleven traveller-facing sentences were
 * stuck behind that single import.
 *
 * This function has no words in it, so it is the half that can live where both
 * sides see it.
 */

/**
 * `YYYY-MM-DD`, and nothing that merely looks like it.
 *
 * The round-trip is the whole test. `Date.parse('2026-02-30')` does not fail —
 * it rolls over to 2026-03-02 — so a date that does not exist would otherwise
 * be accepted and silently answered with a different day.
 */
const isValidTripDate = (value?: string): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

/**
 * Every date from `startDate` to `endDate` inclusive, or none at all.
 *
 * Read in UTC on purpose: these are calendar labels, not instants, and
 * stepping a local date across a DST boundary drops or repeats a day.
 */
export const enumerateTripDates = (startDate?: string, endDate?: string): string[] => {
  if (!isValidTripDate(startDate) || !isValidTripDate(endDate)) return [];
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (end < start) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
};
