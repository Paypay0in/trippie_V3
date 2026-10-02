import { ItineraryItem } from '../types';

/**
 * The first moment a day is actually free.
 *
 * 「第一天行程非常不合理 且有重複的 怎麼會先入境金浦機場再去桃園機場」.
 *
 * The planner was told the trip's dates and nothing else, so it filled the
 * arrival day from the morning: 14:00 抵達金海國際機場並完成入境 sat above the
 * 16:35 departure from Taoyuan that would take them there, and below it the
 * 19:55 landing it claimed to precede. A day you spend in the air is not a day
 * you can be shown places in.
 *
 * Flights are the one thing on an itinerary that cannot move, so they are what
 * a day is planned around rather than over.
 */

/** A fixed item the planner must schedule around, in a shape safe to send over the wire. */
export interface FixedScheduleEntry {
  date: string;
  time: string;
  durationMinutes?: number;
  label: string;
}

const toMinutes = (clock: string): number => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
};

const toClock = (minutes: number): string => {
  const capped = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}:${String(capped % 60).padStart(2, '0')}`;
};

const isValidClock = (value?: string): value is string => Boolean(value && /^\d{2}:\d{2}$/.test(value));

/**
 * A flight, or anything the app derived from one — the airport arrival it
 * generates before the flight and the hotel check-in it generates after.
 */
const isAnchorBound = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) || item.type === 'FLIGHT' || item.fixedEventKind === 'flight';

/**
 * The unmovable travel already on the itinerary, as plain data.
 *
 * This is what the planner needs to know and all it needs to know: a day with a
 * 16:35 departure and a 19:55 landing is not a day it may fill from 09:00.
 */
export const fixedAnchorSchedule = (existingItems: ItineraryItem[]): FixedScheduleEntry[] =>
  existingItems
    .filter(item => item.date && isValidClock(item.time) && isAnchorBound(item))
    .map(item => ({
      date: item.date as string,
      time: item.time as string,
      durationMinutes: Number.isFinite(item.durationMinutes) ? Number(item.durationMinutes) : undefined,
      label: item.title?.trim() || '航班',
    }))
    .sort((left, right) => (left.date === right.date ? left.time.localeCompare(right.time) : left.date.localeCompare(right.date)));

/**
 * Per day, the earliest time a planned activity may start.
 *
 * A day's floor is the end of its last unmovable travel item — on an arrival day
 * that is the hotel check-in, not the landing, because the hour in between is
 * spent getting there. Days with no flight are absent: the planner is free,
 * which is the normal case.
 */
export const earliestFreeStartByDate = (
  entries: FixedScheduleEntry[],
): Record<string, string> => {
  const floors: Record<string, number> = {};

  entries.forEach(entry => {
    if (!entry.date || !isValidClock(entry.time)) return;
    const end = toMinutes(entry.time) + (Number.isFinite(entry.durationMinutes) ? Number(entry.durationMinutes) : 0);
    floors[entry.date] = Math.max(floors[entry.date] ?? 0, end);
  });

  return Object.fromEntries(
    Object.entries(floors).map(([date, minutes]) => [date, toClock(minutes)]),
  );
};

/*
  Things the arrival day already contains.

  Landing, immigration, the taxi rank and hotel check-in all come from the
  flight anchor and the booked hotel, so when the model also writes them as
  activities the day says the same thing twice — 「且有重複的」. Matching by name
  cannot catch it: the anchor says 「入住 廣安里凱星頓特酒店」 and the model says
  「抵達飯店門口並辦理入住」. What they share is the subject.
*/
const ANCHOR_SUBJECTS = [
  /入境/, /出境/, /通關/, /海關/, /領取行李/, /提領行李/, /行李轉盤/,
  /辦理登機/, /登機/, /報到/, /劃位/,
  /機場.*(抵達|到達|出發|前往|搭乘處)/, /(抵達|到達|降落).*機場/, /前往.*機場/,
  /計程車.*(搭乘|招呼|排班|站|處)/, /(搭乘|前往).*(機場巴士|利木津)/, /接送/,
  /(抵達|前往|到達).*(飯店|酒店|旅館|民宿|住宿)/,
  /辦理入住/, /check[\s-]?in/i, /check[\s-]?out/i, /辦理退房/,
];

/**
 * True when a proposed activity merely restates something the flight anchors or
 * the hotel booking already put on that day.
 */
export const isCoveredByFixedSchedule = (placeName?: string, note?: string): boolean => {
  const text = `${placeName || ''} ${note || ''}`.trim();
  if (!text) return false;
  return ANCHOR_SUBJECTS.some(pattern => pattern.test(text));
};
