/**
 * Spotting entry guidance that has already expired.
 *
 * The K-ETA card explains a waiver that ran 「至 2024 年 12 月 31 日」 on a trip
 * departing in 2026, then asks the reader to work out whether it still applies.
 * The text is not wrong — it is out of date, which reads the same until you
 * check the year.
 *
 * Only dates the text states itself are used, and only when the trip departs
 * after the latest of them. No claim is made about what the rule is now: the
 * screen says the period has passed and sends the reader to the official site,
 * which is the only honest thing to say about a rule nobody has re-checked.
 */

/** Latest year mentioned in the text, or null when it mentions none. */
export const latestYearMentioned = (text: string): number | null => {
  const years = [...(text || '').matchAll(/(20\d{2})\s*年?/g)]
    .map(match => Number(match[1]))
    .filter(year => year >= 2000 && year <= 2100);
  return years.length ? Math.max(...years) : null;
};

/**
 * True when the guidance talks about a period that ended before this trip
 * begins. Requires both a stated year and a departure date; without either,
 * nothing is claimed.
 */
export const isGuidanceOutdated = (text: string, tripStartDate?: string): boolean => {
  const year = latestYearMentioned(text);
  const start = (tripStartDate || '').slice(0, 4);
  if (!year || !/^20\d{2}$/.test(start)) return false;
  return year < Number(start);
};
