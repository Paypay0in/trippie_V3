import { FixedScheduleEntry, earliestFreeStartByDate, latestFreeStartByDate } from './itineraryDayFloor';

/**
 * A day as a row of fixed blocks, rather than a list that shifts.
 *
 * 「目前行程表會一直跑版 … 一個行程都預設抓 2 小時，讓用戶用下拉式選單的方式來排
 * 行程。早餐、午餐、晚餐區塊也是兩小時」.
 *
 * The plan drifted because every item carried its own clock: one without a
 * duration was guessed at sixty minutes, the next overlapped it, and the whole
 * afternoon moved every time anything was added. Blocks fix that by inverting
 * it — the day's shape is decided first and places are dropped into it, so
 * adding a restaurant cannot move the museum.
 *
 * The flights are not blocks. They are what the blocks have to fit around:
 * 「航班時間是固定的行程，預留兩小時前到機場是必要固定的行程」 — the first block of
 * an arrival day starts after the traveller is actually out of the airport, and
 * the last block of a departure day ends before they have to leave for it.
 */

export type DaySlotKind = 'meal' | 'activity';

export interface DaySlot {
  /** Stable for a given day and position, so a selection survives a re-render. */
  id: string;
  kind: DaySlotKind;
  /** 早餐 / 上午行程 / 午餐 / 下午行程 / 晚餐 / 晚上行程. */
  label: string;
  startTime: string;
  endTime: string;
}

/** 「一個行程都預設抓 2 小時」, meals included. */
export const BLOCK_MINUTES = 120;

/** When the day starts if the traveller has not said. */
export const DEFAULT_DAY_START = '10:00';

/** Nothing is scheduled past this; a block starting later is one nobody uses. */
export const DEFAULT_DAY_END = '21:00';

const toMinutes = (clock: string): number => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
};

const toClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const isClock = (value?: string): value is string => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');

/**
 * When a block counts as a meal.
 *
 * By the clock rather than by position in the day: a day that starts at 08:00
 * opens with breakfast and one that starts at 11:00 opens with lunch, and
 * neither needs a special case. A block belongs to a meal when it *starts*
 * inside the window — a 14:00 block is the afternoon, even though lunch ran
 * until then.
 */
const MEAL_WINDOWS: Array<{ label: string; from: string; to: string }> = [
  { label: '早餐', from: '06:00', to: '10:00' },
  { label: '午餐', from: '11:30', to: '14:00' },
  { label: '晚餐', from: '17:30', to: '20:30' },
];

const mealAt = (startMinutes: number): string | undefined =>
  MEAL_WINDOWS.find(window => startMinutes >= toMinutes(window.from) && startMinutes < toMinutes(window.to))?.label;

/** What to call an activity block, by the time of day it falls in. */
const activityLabel = (startMinutes: number): string => {
  if (startMinutes < toMinutes('12:00')) return '上午行程';
  if (startMinutes < toMinutes('17:00')) return '下午行程';
  return '晚上行程';
};

export interface DayTemplateInput {
  date: string;
  /** 「可以跟用戶確定每天出發旅遊的時間」. */
  dayStart?: string;
  dayEnd?: string;
  /** The flights and check-ins this day has to fit around. */
  fixedSchedule?: FixedScheduleEntry[];
  blockMinutes?: number;
}

/**
 * The blocks a day has room for.
 *
 * Empty when the flights leave no room — an arrival landing at 20:00 has no
 * day to plan, and offering three slots after it would be inventing time.
 */
export const buildDaySlots = ({
  date,
  dayStart,
  dayEnd,
  fixedSchedule = [],
  blockMinutes = BLOCK_MINUTES,
}: DayTemplateInput): DaySlot[] => {
  /*
    The flights decide the edges, and the traveller decides the middle.

    `earliestFreeStartByDate` already knows when they are out of the airport
    and checked in, and `latestFreeStartByDate` when they have to leave for the
    flight home — the same two functions the AI planner is bounded by, so the
    template and the planner cannot disagree about what a day has room for.
  */
  const floor = earliestFreeStartByDate(fixedSchedule)[date];
  const ceiling = latestFreeStartByDate(fixedSchedule)[date];

  const requested = isClock(dayStart) ? dayStart : DEFAULT_DAY_START;
  const start = floor && floor > requested ? floor : requested;
  const end = (() => {
    const wanted = isClock(dayEnd) ? dayEnd : DEFAULT_DAY_END;
    return ceiling && ceiling < wanted ? ceiling : wanted;
  })();

  const slots: DaySlot[] = [];
  let cursor = toMinutes(start);
  const limit = toMinutes(end);

  while (cursor + blockMinutes <= limit) {
    const meal = mealAt(cursor);
    slots.push({
      id: `${date}-${toClock(cursor)}`,
      kind: meal ? 'meal' : 'activity',
      label: meal || activityLabel(cursor),
      startTime: toClock(cursor),
      endTime: toClock(cursor + blockMinutes),
    });
    cursor += blockMinutes;
  }

  return slots;
};

/**
 * Which block an existing itinerary item sits in.
 *
 * Matched on the hour it starts rather than on exact equality, because an item
 * dragged to 10:15 is still the 10:00 block — and a block that loses its
 * occupant the moment somebody nudges it is a block that offers to double-book
 * the morning.
 */
export const slotForTime = (slots: DaySlot[], time?: string): DaySlot | undefined => {
  if (!isClock(time)) return undefined;
  const minutes = toMinutes(time as string);
  return slots.find(slot => minutes >= toMinutes(slot.startTime) && minutes < toMinutes(slot.endTime));
};
