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

/**
 * What an unmovable item does to the day around it.
 *
 * `to_airport` and `departure` close a day down: after them the traveller is
 * leaving. `landing` and `checkin` open one up: before them they have not
 * arrived. Which one it is decides whether the free time is before or after,
 * and getting that backwards pushes the whole last day to after the flight home.
 */
export type FixedScheduleRole = 'to_airport' | 'departure' | 'landing' | 'checkin' | 'other';

/** A fixed item the planner must schedule around, in a shape safe to send over the wire. */
export interface FixedScheduleEntry {
  date: string;
  time: string;
  durationMinutes?: number;
  label: string;
  role?: FixedScheduleRole;
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
 * A flight, anything derived from one, or a check-in.
 *
 * Check-in is not a flight and is deliberately not fixed — the hour you walk
 * into a hotel is movable. It is here because on arrival day it is where the
 * ride from the airport ends, and that hour is not sightseeing time. It only
 * ever extends a floor a landing already opened; a mid-trip hotel change on a
 * day with no flight constrains nothing.
 */
const isAnchorBound = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId)
  || item.type === 'FLIGHT'
  || item.fixedEventKind === 'flight'
  || item.fixedEventKind === 'accommodation';

/*
  Which kind of anchor an item is.

  Read from the derived-item id, which flightDerivedItems builds as
  `flight-arrival-<anchor>` (be at the airport), `flight-departure-<anchor>`
  (take-off) and `flight-landing-<anchor>` (touch down). The id is the one part
  of these items that is generated rather than typed, so it is the only part
  that cannot be renamed out from under this.
*/
const roleOf = (item: ItineraryItem): FixedScheduleRole => {
  if (item.id.startsWith('flight-arrival-')) return 'to_airport';
  if (item.id.startsWith('flight-departure-')) return 'departure';
  if (item.id.startsWith('flight-landing-')) return 'landing';
  if (item.fixedEventKind === 'accommodation') return 'checkin';
  return 'other';
};

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
      role: roleOf(item),
    }))
    .sort((left, right) => (left.date === right.date ? left.time.localeCompare(right.time) : left.date.localeCompare(right.date)));

/**
 * The same thing, from the lossy snapshot the AI adjustment route receives.
 *
 * That payload has already dropped `type` and `fixedEventKind`, keeping
 * `fixedEvent` / `accommodation` flags — but it keeps the id, which is where
 * the role actually lives.
 */
export const fixedAnchorScheduleFromSnapshot = (
  items: Array<{ id?: unknown; date?: unknown; startTime?: unknown; durationMinutes?: unknown; placeName?: unknown; fixedEvent?: unknown; accommodation?: unknown }>,
): FixedScheduleEntry[] =>
  items
    .filter(item => typeof item?.id === 'string' && typeof item?.date === 'string' && isValidClock(item?.startTime as string)
      && (item.fixedEvent === true || item.accommodation === true))
    .map(item => ({
      date: item.date as string,
      time: item.startTime as string,
      durationMinutes: typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) ? item.durationMinutes : undefined,
      label: typeof item.placeName === 'string' && item.placeName.trim() ? item.placeName.trim() : '航班',
      role: item.accommodation === true && !(item.id as string).startsWith('flight-')
        ? ('checkin' as FixedScheduleRole)
        : roleOf({ id: item.id as string } as ItineraryItem),
    }))
    .sort((left, right) => (left.date === right.date ? left.time.localeCompare(right.time) : left.date.localeCompare(right.date)));

const endOf = (entry: FixedScheduleEntry): number =>
  toMinutes(entry.time) + (Number.isFinite(entry.durationMinutes) ? Number(entry.durationMinutes) : 0);

const byDate = (entries: FixedScheduleEntry[]): Map<string, FixedScheduleEntry[]> => {
  const grouped = new Map<string, FixedScheduleEntry[]>();
  entries.forEach(entry => {
    if (!entry.date || !isValidClock(entry.time)) return;
    const day = grouped.get(entry.date) || [];
    day.push(entry);
    grouped.set(entry.date, day.sort((left, right) => left.time.localeCompare(right.time)));
  });
  return grouped;
};

const isLeaving = (entry: FixedScheduleEntry): boolean =>
  entry.role === 'to_airport' || entry.role === 'departure';

/*
  Arrival day and the day home have the identical shape — be at the airport,
  take off, land — so the roles alone cannot tell them apart. What separates
  them is where in the trip they fall: the first flight takes you there, the
  last one brings you home.
*/
const goingHomeDate = (entries: FixedScheduleEntry[]): string | undefined => {
  const lastLeavingDate = entries.filter(isLeaving).map(entry => entry.date).sort().pop();
  if (!lastLeavingDate) return undefined;
  // A flight is only the way back if they arrived somewhere first. A trip with
  // one flight entered so far is an outbound, and its landing still counts.
  const arrivedEarlier = entries.some(entry => entry.role === 'landing' && entry.date < lastLeavingDate);
  return arrivedEarlier ? lastLeavingDate : undefined;
};

/**
 * Per day, the earliest time a planned activity may start.
 *
 * Only arriving creates a floor: the landing, and whatever unmovable thing
 * follows it that same day, which on arrival day is the hotel check-in — the
 * hour in between is spent getting there.
 *
 * Flying home creates none. The last day is free until they leave for the
 * airport, and a floor there would push that whole morning to after the plane
 * had gone — the same absurdity, pointing the other way.
 */
export const earliestFreeStartByDate = (
  entries: FixedScheduleEntry[],
): Record<string, string> => {
  const floors: Record<string, string> = {};
  const homeward = goingHomeDate(entries);

  byDate(entries).forEach((day, date) => {
    const lastLanding = day.filter(entry => entry.role === 'landing').pop();
    if (!lastLanding) return;
    // The landing at the end of the day they fly home is the one back in
    // Taiwan. It ends the trip; it does not open a window.
    if (date === homeward && day.some(entry => isLeaving(entry) && entry.time < lastLanding.time)) return;

    // The landing, plus anything unmovable still to come before they leave again.
    const leavingAfter = day.find(entry => isLeaving(entry) && entry.time > lastLanding.time);
    const floor = day
      .filter(entry => entry.time >= lastLanding.time && (!leavingAfter || entry.time < leavingAfter.time))
      .reduce((latest, entry) => Math.max(latest, endOf(entry)), 0);
    floors[date] = toClock(floor);
  });

  return floors;
};

/**
 * Per day, the latest time a planned activity may still start.
 *
 * Set by the trip to the airport: once they have to be at the gate the day is
 * over. Absent on days nobody flies out, which is most of them.
 */
export const latestFreeStartByDate = (
  entries: FixedScheduleEntry[],
): Record<string, string> => {
  const ceilings: Record<string, string> = {};
  const floors = earliestFreeStartByDate(entries);

  byDate(entries).forEach((day, date) => {
    const leaving = day.find(entry => isLeaving(entry) && (!floors[date] || entry.time > floors[date]));
    if (leaving) ceilings[date] = leaving.time;
  });

  return ceilings;
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
