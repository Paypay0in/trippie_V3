import { ItineraryItem } from '../types';

/**
 * Which stop is actually next.
 *
 * 「現在是晚上十點半 他沒有跟著本機時間在判斷下一站」. At 22:37 in Busan the card
 * read 下一站 14:35 抵達機場（桃園） — a flight he had already taken, eight hours
 * earlier, on the other side of the Korea Strait.
 *
 * The rule it shipped with said so in as many words: every incomplete item
 * today stays actionable, and the clock is only used to sort them. The
 * intention was decent — a stop you did not tick is not a stop you did not
 * make — but it means the whole day points at breakfast until somebody starts
 * ticking boxes, and nobody ticks boxes while travelling. 0/6 項已完成 on the
 * same screen is the proof.
 *
 * So the clock decides. An item is still ahead of you while it is running, not
 * only before it starts; once it is over it is behind you, ticked or not. When
 * today is spent, the next stop is tomorrow's first — which at half past ten at
 * night is exactly the thing worth knowing.
 */

export type NextStopKind = 'now' | 'today' | 'later_day';

export interface NextStopResult {
  item: ItineraryItem;
  /** `now` = already under way, `today` = still to come, `later_day` = another date. */
  kind: NextStopKind;
}

/** Minutes past midnight, from a time that may carry other text around it. */
export const timeToMinutes = (value?: string): number | null => {
  const match = (value || '').trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$|:)/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
};

export const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * How long an item occupies before it is behind you.
 *
 * A flight with no stated duration would otherwise fall off the card the minute
 * it departed, so an item with no duration still holds the slot briefly.
 */
const GRACE_MINUTES = 30;

const endMinutesOf = (item: ItineraryItem, start: number): number =>
  start + (typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0
    ? item.durationMinutes
    : GRACE_MINUTES);

const byTimeThenUntimed = (left: ItineraryItem, right: ItineraryItem): number => {
  const leftTime = timeToMinutes(left.time);
  const rightTime = timeToMinutes(right.time);
  if (leftTime === null && rightTime === null) return 0;
  // An item with no time is not a claim about when; it waits behind the ones
  // that are, rather than jumping the queue by sorting as zero.
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return leftTime - rightTime;
};

/**
 * The next stop, read against the device clock.
 *
 * `trip` bounds the search so a finished trip does not start advertising a
 * stop on a date nobody is travelling.
 */
export const selectNextStop = (
  itinerary: ItineraryItem[],
  now: Date,
  trip: { startDate?: string; endDate?: string } = {},
): NextStopResult | undefined => {
  const today = localDateKey(now);
  if ((trip.startDate && today < trip.startDate) || (trip.endDate && today > trip.endDate)) return undefined;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const open = itinerary.filter(item => item.isCompleted !== true && item.date);

  const todayOpen = open.filter(item => item.date === today).sort(byTimeThenUntimed);

  // Under way right now: started, not finished.
  const running = todayOpen.find(item => {
    const start = timeToMinutes(item.time);
    return start !== null && start <= currentMinutes && endMinutesOf(item, start) > currentMinutes;
  });
  if (running) return { item: running, kind: 'now' };

  // Still ahead today, plus anything today with no time on it at all — an
  // untimed plan for today has not been missed, it was never scheduled.
  const aheadToday = todayOpen.find(item => {
    const start = timeToMinutes(item.time);
    return start === null || start > currentMinutes;
  });
  if (aheadToday) return { item: aheadToday, kind: 'today' };

  // Today is spent. The next stop is the first one on the next day that has any.
  const laterDays = open
    .filter(item => (item.date as string) > today && (!trip.endDate || (item.date as string) <= trip.endDate))
    .sort((left, right) => ((left.date as string) === (right.date as string)
      ? byTimeThenUntimed(left, right)
      : (left.date as string).localeCompare(right.date as string)));

  return laterDays[0] ? { item: laterDays[0], kind: 'later_day' } : undefined;
};
