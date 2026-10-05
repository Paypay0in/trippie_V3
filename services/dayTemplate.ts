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
  /**
   * Stable for a given day and position.
   *
   * By position rather than by clock time, because the clock moves: 「後來的行程
   * 就都要自動提前或順延」, so a block keyed on 「14:00」 would change identity the
   * moment an earlier block was lengthened, and the length the traveller just
   * set would belong to a different block.
   */
  id: string;
  /** Where it sits in the day, counting from zero. */
  index: number;
  kind: DaySlotKind;
  /** 早餐 / 上午行程 / 午餐 / 下午行程 / 晚餐 / 晚上行程. */
  label: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  /** The itinerary item in this block, where there is one. */
  occupantId?: string;
}

/** 「一個行程都預設抓 2 小時」, meals included — until the traveller says otherwise. */
export const BLOCK_MINUTES = 120;

/** When the day starts if the traveller has not said. */
export const DEFAULT_DAY_START = '10:00';

/** Nothing is scheduled past this; a block starting later is one nobody uses. */
export const DEFAULT_DAY_END = '21:00';

/**
 * What an itinerary item with no stated length runs for.
 *
 * Sixty minutes, which is what the timeline already draws and what the overlap
 * warnings already assume — `DEFAULT_DURATION_MINUTES` in `itineraryTimeline`.
 * Repeated as a constant rather than imported to keep this module free of the
 * timeline's types; the two are checked against each other in the tests.
 */
export const DEFAULT_ITEM_MINUTES = 60;

/** Shorter than this between two plans is not a slot anyone can fill. */
export const MIN_FREE_MINUTES = 30;

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
  /**
   * How long each block runs, by position, where the traveller or the AI has
   * said something other than the default.
   *
   * 「讓用戶可以自己調整停留時間，AI 也可以建議。後來的行程就都要自動提前或順延」 —
   * so a block's length is an input and its start time is an output. Lengthen
   * the morning and the afternoon moves with it, rather than overlapping it.
   */
  durations?: Record<number, number>;
  /**
   * What is already on this day, by the clock.
   *
   * 「這個表 不是刪掉行程就會消失 要固定存在」. The blocks are the day, not a
   * rendering of the items in it — so an item is placed into whichever block
   * its time falls in, and the blocks before and after it exist either way. A
   * day whose first item is at 17:00 still has a morning.
   *
   * An occupant's own length wins for the block it sits in, and everything
   * after it moves: that is the same cascade a traveller gets by changing a
   * length by hand.
   */
  occupants?: Array<{ id: string; time?: string; durationMinutes?: number }>;
}

export interface DayTemplate {
  slots: DaySlot[];
  /**
   * True when the day filled up before the blocks did.
   *
   * 「延長後晚餐排不進今天」 is worth saying out loud. The alternative — quietly
   * running a block past the time they have to leave for the airport — is the
   * overlap this whole design exists to end.
   */
  ranOutOfDay: boolean;
}

/**
 * The blocks a day has room for.
 *
 * Empty when the flights leave no room — an arrival landing at 20:00 has no
 * day to plan, and offering three slots after it would be inventing time.
 */
export const buildDayTemplate = ({
  date,
  dayStart,
  dayEnd,
  fixedSchedule = [],
  blockMinutes = BLOCK_MINUTES,
  durations = {},
  occupants = [],
}: DayTemplateInput): DayTemplate => {
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
  /*
    Nothing already on the day may fall outside the grid.

    An item at 08:00 on a day that starts at 10:00 would otherwise have no
    block to sit in, and would read as though it had been deleted.
  */
  const earliestOccupant = occupants
    .map(entry => entry.time)
    .filter(isClock)
    .sort()[0];
  const openAt = earliestOccupant && earliestOccupant < requested ? earliestOccupant : requested;
  const start = floor && floor > openAt ? floor : openAt;
  const end = (() => {
    const wanted = isClock(dayEnd) ? dayEnd : DEFAULT_DAY_END;
    return ceiling && ceiling < wanted ? ceiling : wanted;
  })();

  const slots: DaySlot[] = [];
  let cursor = toMinutes(start);
  const limit = toMinutes(end);
  let index = 0;
  let ranOutOfDay = false;
  const used = new Set<string>();

  /*
    What is already planned keeps its own clock; the free time between is cut
    into blocks.

    「這裡的時間線 跟行程表的不一樣」. Packing every block end to end made the
    table disagree with the timeline it is a view of: an item at 12:00 landed in
    a block labelled 11:30, and a 60-minute stop appeared as two hours, because
    the block's start was an accumulation of lengths rather than the item's own
    time. Two answers to 「when is 新世界百貨」 is one too many — and the one the
    traveller is actually standing in is the itinerary's.

    So an occupied block reports the item: its time, its length. Only the gaps
    between items are ours to shape, and only there does 「a length is an input,
    a start time is an output」 apply.
  */
  const planned = occupants
    .filter(entry => isClock(entry.time))
    .map(entry => ({
      id: entry.id,
      from: toMinutes(entry.time as string),
      /*
        The same fallback the timeline draws with.

        An item with no length is sixty minutes everywhere else on this screen;
        a block that called it two hours would be the disagreement again, one
        layer down.
      */
      minutes: Number.isFinite(entry.durationMinutes) && (entry.durationMinutes as number) > 0
        ? (entry.durationMinutes as number)
        : DEFAULT_ITEM_MINUTES,
    }))
    .sort((left, right) => left.from - right.from);

  const MAX_BLOCKS = 12;
  while (index < MAX_BLOCKS && cursor < limit) {
    const next = planned.find(entry => !used.has(entry.id) && entry.from + entry.minutes > cursor);

    if (next && next.from <= cursor) {
      // Standing in it now. Reported exactly as the itinerary holds it, even
      // when it started before the day's grid or runs past the end of it:
      // trimming an item to fit a block would be the table editing the plan.
      used.add(next.id);
      const meal = mealAt(next.from);
      slots.push({
        id: `${date}#${index}`,
        index,
        kind: meal ? 'meal' : 'activity',
        label: meal || activityLabel(next.from),
        startTime: toClock(next.from),
        endTime: toClock(next.from + next.minutes),
        durationMinutes: next.minutes,
        occupantId: next.id,
      });
      cursor = Math.max(cursor, next.from + next.minutes);
      index += 1;
      continue;
    }

    /*
      Free time, cut to the block size — but never past whatever comes next.

      A gap too short to put anything in is not offered: a 15-minute hole
      between two bookings is not a slot, and a dropdown over it would promise
      room the day does not have.
    */
    const wanted = Number.isFinite(durations[index]) && (durations[index] as number) > 0
      ? (durations[index] as number)
      : blockMinutes;
    const until = next ? Math.min(next.from, cursor + wanted) : cursor + wanted;
    const free = until - cursor;

    if (next && free < MIN_FREE_MINUTES) {
      cursor = next.from;
      continue;
    }

    if (cursor + free > limit || free <= 0) {
      /*
        A block the day has no room for. Said rather than squeezed.

        Only when a custom length is what pushed it out: a day that simply ends
        is not an overflow, and reporting one would put a warning on every
        ordinary evening.
      */
      ranOutOfDay = free > blockMinutes && cursor + blockMinutes <= limit;
      break;
    }

    const meal = mealAt(cursor);
    slots.push({
      id: `${date}#${index}`,
      index,
      kind: meal ? 'meal' : 'activity',
      label: meal || activityLabel(cursor),
      startTime: toClock(cursor),
      endTime: toClock(cursor + free),
      durationMinutes: free,
    });
    cursor += free;
    index += 1;
  }

  return { slots, ranOutOfDay };
};

/** The blocks alone, for callers that do not care whether the day filled up. */
export const buildDaySlots = (input: DayTemplateInput): DaySlot[] => buildDayTemplate(input).slots;

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
