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
  /**
   * This stop starts after the day's grid ends.
   *
   * 「我在行程表下方改行程 上方的行程表不會同步」 — the calendar showed a stop at
   * 22:43 and the planner showed a day ending at 20:15, because the grid stops
   * at 21:00 and never reached it. It is listed now, marked, because a table
   * that cannot draw a stop cannot manage it and the reader is looking at a
   * day that is not the day.
   */
  pastDayEnd?: boolean;
}

/** 「一個行程都預設抓 2 小時」, meals included — until the traveller says otherwise. */
export const BLOCK_MINUTES = 120;

/** When the day starts if the traveller has not said. */
export const DEFAULT_DAY_START = '10:00';

/** Nothing is scheduled past this; a block starting later is one nobody uses. */
export const DEFAULT_DAY_END = '21:00';

/**
 * How late the day may still be *extended* to, when its last stop ends at the
 * edge of the grid.
 *
 * 「這邊少了一個：無」 — a day whose dinner ran 19:00–21:00 ended on that row,
 * with nothing under it. Every other row offers 無 and a way to fill it; the
 * last one offered the end of the table, so a drink after dinner had to be
 * added from somewhere else entirely.
 *
 * Separate from `DEFAULT_DAY_END` on purpose: this is not 「plan until 23:00」,
 * which would hand everybody two empty evening rows they did not ask for. It
 * is 「there is always one more row」.
 */
export const LATEST_EXTENSION = '23:00';

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
// i18n-data: `slotLabel.ts` matches these against MEAL_LABELS and
// `optimiseTripRoute` carries them as the missing-meal key; a translated label
// stops matching and renames a block nobody renamed.
/**
 * Which meal a window is, independent of what the block is called.
 *
 * `label` is the block's identity — `slotLabel.ts` recognises a meal window by
 * matching it, and `dayTemplate` keys 「a meal happens once」 on it — so it
 * cannot be translated. `key` is the same window said in a way a screen can
 * look a sentence up by, which is what anything *rendering* a meal window
 * should carry instead of the label.
 */
export type MealKey = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_WINDOWS: Array<{ key: MealKey; label: string; from: string; to: string }> = [
  { key: 'breakfast', label: '早餐', from: '06:00', to: '10:00' }, // i18n-data: `slotLabel.ts` matches this against MEAL_LABELS and `dayTemplate` keys the block on it; render through `key` instead
  { key: 'lunch', label: '午餐', from: '11:30', to: '14:00' }, // i18n-data: `slotLabel.ts` matches this against MEAL_LABELS and `dayTemplate` keys the block on it; render through `key` instead
  { key: 'dinner', label: '晚餐', from: '17:30', to: '20:30' }, // i18n-data: `slotLabel.ts` matches this against MEAL_LABELS and `dayTemplate` keys the block on it; render through `key` instead
];

const mealAt = (startMinutes: number): string | undefined =>
  MEAL_WINDOWS.find(window => startMinutes >= toMinutes(window.from) && startMinutes < toMinutes(window.to))?.label;

/** What to call an activity block, by the time of day it falls in. */
// i18n-data: the slot label `slotLabel.ts` reads back and returns unchanged for
// an empty block; display happens there, keyed on this value.
const activityLabel = (startMinutes: number): string => {
  if (startMinutes < toMinutes('12:00')) return '上午行程'; // i18n-data: the slot label `slotLabel.ts` reads back and returns unchanged for an empty block
  if (startMinutes < toMinutes('17:00')) return '下午行程'; // i18n-data: the slot label `slotLabel.ts` reads back and returns unchanged for an empty block
  return '晚上行程'; // i18n-data: the slot label `slotLabel.ts` reads back and returns unchanged for an empty block
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
    A meal happens once.

    Two blocks starting inside 11:30–14:00 both read 午餐, so his Day 4 offered
    lunch at 11:46 and lunch again at 13:46 — and a day with two lunches and
    two dinners is not a day anybody recognises. The window is the right way
    to decide *which* block is the meal; it was being asked about every block
    independently.

    First one in the window takes it, which follows the same 「by the clock」
    rule the labels are built on: the block you reach first at lunchtime is
    lunch, and whatever comes after it is the afternoon.
  */
  const eaten = new Set<string>();

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

  /*
    Whichever block holds something wins the label.

    A test caught the first version handing 午餐 to the thirty-minute gap
    before a 12:30 lunch, simply because the gap came first. 「the block you
    reach first at lunchtime」 is the right rule only among empty ones — a
    window that already has a stop in it has an answer, and it is that stop.
  */
  const occupiedMealStart = new Map<string, number>();
  planned.forEach(entry => {
    const meal = mealAt(entry.from);
    if (meal && !occupiedMealStart.has(meal)) occupiedMealStart.set(meal, entry.from);
  });

  const mealOnce = (startMinutes: number): string | undefined => {
    const meal = mealAt(startMinutes);
    if (!meal || eaten.has(meal)) return undefined;
    const held = occupiedMealStart.get(meal);
    if (held !== undefined && held !== startMinutes) return undefined;
    eaten.add(meal);
    return meal;
  };

  const MAX_BLOCKS = 12;
  /*
    The grid stops offering empty blocks at the day's end — and keeps walking
    while there are still planned stops out there.

    These are two different limits and they were one. A stop at exactly 21:00
    failed `cursor < limit` on the first turn, so the loop never reached it:
    it fell out as 「排在今天的時段之外」 while an empty 21:00–23:00 row was
    offered on top of it. Two rows for the same half of the evening, one of
    them claiming the time the other one is already using.

    `limit` still governs what is *offered*, which is the rule that keeps
    nobody's evening filled with blocks they did not ask for. Reaching a stop
    that exists is not an offer.
  */
  const stillPlanned = (from: number): boolean =>
    planned.some(entry => !used.has(entry.id) && entry.from + entry.minutes > from);

  while (index < MAX_BLOCKS && (cursor < limit || stillPlanned(cursor))) {
    const next = planned.find(entry => !used.has(entry.id) && entry.from + entry.minutes > cursor);

    /*
      Past the day's end with something still to come: walk to it rather than
      cutting the gap into blocks. Free time after the day has ended is not
      free time anybody asked to fill.
    */
    if (cursor >= limit && next && next.from > cursor) {
      cursor = next.from;
      continue;
    }

    if (next && next.from <= cursor) {
      // Standing in it now. Reported exactly as the itinerary holds it, even
      // when it started before the day's grid or runs past the end of it:
      // trimming an item to fit a block would be the table editing the plan.
      used.add(next.id);
      const meal = mealOnce(next.from);
      slots.push({
        id: `${date}#${index}`,
        index,
        kind: meal ? 'meal' : 'activity',
        label: meal || activityLabel(next.from),
        startTime: toClock(next.from),
        endTime: toClock(next.from + next.minutes),
        durationMinutes: next.minutes,
        occupantId: next.id,
        // Reached, but still outside the day the grid offers.
        ...(next.from >= limit ? { pastDayEnd: true } : {}),
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

    /*
      A sliver before the day's first stop is not free time.

      The grid opens at 10:00 so that an item at 08:00 still has a block to sit
      in, and a day whose first stop is at 17:00 still has a morning to plan
      into. But a day whose first stop is at 10:30 got a 30-minute 10:00–10:30
      row — an artefact of where the grid opens, offering to fill half an hour
      nobody has, and 幾點出門 right above it already says the day starts 10:30.

      Only before the first slot, and only when it is shorter than a whole
      block: a real gap in the middle of a day is a real gap.
    */
    const slimOpening = slots.length === 0 && next && free < blockMinutes;

    if (next && (free < MIN_FREE_MINUTES || slimOpening)) {
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

    const meal = mealOnce(cursor);
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

  /*
    One more row, always.

    The grid stops at `DEFAULT_DAY_END`, so a day whose last stop ends exactly
    there ended on a filled row — the table said 「this is the day」 and then
    offered no way to add anything after dinner. Only when the day is full to
    its edge: a day with empty rows already has somewhere to put things.

    Never past the flight home, and never past `LATEST_EXTENSION`: 「one more
    row」 is a row somebody might use, not a 02:00 block.
  */
  const lastSlot = slots[slots.length - 1];
  const extensionLimit = Math.min(
    toMinutes(LATEST_EXTENSION),
    ceiling ? toMinutes(ceiling) : toMinutes(LATEST_EXTENSION),
  );
  const lastEnds = lastSlot ? toMinutes(lastSlot.startTime) + lastSlot.durationMinutes : 0;
  /*
    Only when the day is full to its own edge.

    A day with time left at the end already has an answer for that time: the
    loop above offered it, or refused it for being shorter than a block, and
    re-offering it here would undo that rule rather than extend the day.
  */
  if (lastSlot?.occupantId && lastEnds >= limit && index < MAX_BLOCKS) {
    const from = lastEnds;
    const free = Math.min(blockMinutes, extensionLimit - from);
    if (free >= MIN_FREE_MINUTES) {
      const meal = mealOnce(from);
      slots.push({
        id: `${date}#${index}`,
        index,
        kind: meal ? 'meal' : 'activity',
        label: meal || activityLabel(from),
        startTime: toClock(from),
        endTime: toClock(from + free),
        durationMinutes: free,
      });
    }
  }

  /*
    Anything planned that the grid never reached.

    「我在行程表下方改行程 上方的行程表不會同步」 — the calendar showed 寶可夢中心
    at 22:43 and the planner showed a clean day ending at 20:15, because the
    loop above stops at the day's end （21:00） and an item starting after it
    is never visited. No slot, no `occupantId`, so `replaceInSlot` could not
    see it either: filling the 12:15 row added a *second* copy of the place
    and left the 22:43 one exactly where it was.

    A table that cannot draw a stop cannot manage it, and the traveller is
    reading a day that is not the day. These are appended rather than folded
    into the grid: they are outside it, which is the fact worth seeing, and
    the one that explains why the calendar above disagrees.

    Not capped by `MAX_BLOCKS`. That cap limits how many empty blocks the day
    *offers*; hiding a stop that exists is a different thing entirely.
  */
  const stranded = planned
    .filter(entry => !used.has(entry.id))
    .sort((left, right) => left.from - right.from);
  stranded.forEach(entry => {
    // Only a stop the grid genuinely could not reach is marked; the loop above
    // now walks to everything else.
    slots.push({
      id: `${date}#${index}`,
      index,
      kind: 'activity',
      label: activityLabel(entry.from),
      startTime: toClock(entry.from),
      endTime: toClock(entry.from + entry.minutes),
      durationMinutes: entry.minutes,
      occupantId: entry.id,
      /*
        Said only when it is true.

        A stop the grid could not reach is not necessarily after the day ends
        — 八十八淺草 at 16:00 was unreachable because it overlapped a stop
        already placed, and labelling that 「排在今天的時段之外」 told the
        traveller something false about a stop sitting in the middle of his
        afternoon.
      */
      ...(entry.from >= limit ? { pastDayEnd: true } : {}),
    });
    index += 1;
  });

  /*
    A day is read down the clock.

    「這個順序還是沒有排列好 覺得要有1234」 — the stranded stops above are
    appended after the grid, so a 16:00 stop the loop could not reach was
    drawn below the 19:00 row. Every row carries its own time, so the table
    was not lying; it was just impossible to read as a day.

    Sorted here rather than at each caller: the order of a day is a property
    of the day, and two screens sorting it separately is how they come to
    disagree. Positions are renumbered afterwards so `index` and `id` keep
    meaning 「where this sits in the day」, which is what they are keyed on.
  */
  const ordered = [...slots]
    .sort((left, right) => toMinutes(left.startTime) - toMinutes(right.startTime))
    .map((slot, position) => ({ ...slot, index: position, id: `${date}#${position}` }));

  return { slots: ordered, ranOutOfDay };
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
