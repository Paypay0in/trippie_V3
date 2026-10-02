import { ItineraryItem } from '../types';
import { scheduleProposalDay } from './itineraryScheduling';

/**
 * Time facts about a day's itinerary: reading and writing clock values, how long
 * an activity lasts, whether two activities overlap, and re-sequencing a day's
 * times to match the order its cards are in.
 *
 * Deliberately contains no layout. The itinerary is a fixed-card list, not a
 * calendar, so nothing here maps a time to a pixel.
 */

/** Granularity for any generated time. */
export const SNAP_MINUTES = 30;
/** Assumed length of an item whose source supplied no duration. */
export const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_IN_DAY = 24 * 60;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTimedItem = (item: Pick<ItineraryItem, 'time'>): boolean =>
  TIME_PATTERN.test(item.time || '');

export const timeToMinutes = (time: string): number | undefined => {
  const match = TIME_PATTERN.exec(time || '');
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
};

export const minutesToTime = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(Math.round(minutes), MINUTES_IN_DAY - 1));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

/** Rounds to the nearest snap slot, so a drag can never produce 11:07. */
export const snapMinutes = (minutes: number, interval: number = SNAP_MINUTES): number => {
  const snapped = Math.round(minutes / interval) * interval;
  return Math.max(0, Math.min(snapped, MINUTES_IN_DAY - interval));
};

export const durationOf = (item: Pick<ItineraryItem, 'durationMinutes'>): number =>
  typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0
    ? item.durationMinutes
    : DEFAULT_DURATION_MINUTES;


/**
 * When an activity ends: its start plus however long it takes.
 *
 * 「每個行程起訖時間都要可以填寫 目前只有起的時間 若沒有填寫訖的時間一律以 60 分鐘
 * 為主」. The hour was already the assumption everywhere — collisions, travel
 * gaps, the AI scheduler — it was simply never shown, so a day could not be read
 * and the overlap warnings arrived out of nowhere.
 *
 * Empty for an item with no start: an end time without a beginning is not a
 * span, and showing one would invite a duration that means nothing.
 */
export const endTimeOf = (item: Pick<ItineraryItem, 'time' | 'durationMinutes'>): string => {
  const start = timeToMinutes(item.time || '');
  if (start === undefined) return '';
  return minutesToTime(Math.min(start + durationOf(item), MINUTES_IN_DAY - 1));
};

/**
 * The duration implied by an end time, or nothing when it cannot be one.
 *
 * An end before the start is the common slip — picking 09:00 when 21:00 was
 * meant — and the honest response is to leave the item alone rather than store
 * a negative length or silently roll it over midnight.
 */
export const durationFromEnd = (startTime?: string, endTime?: string): number | undefined => {
  const start = timeToMinutes(startTime || '');
  const end = timeToMinutes(endTime || '');
  if (start === undefined || end === undefined || end <= start) return undefined;
  return end - start;
};

/**
 * Ids of items whose scheduled span overlaps another's.
 *
 * Overlap is half-open — an activity ending at 13:00 does not collide with one
 * starting at 13:00 — because back-to-back is a normal plan, not a conflict.
 */
export const detectCollisions = (items: ItineraryItem[]): string[] => {
  const timed = items
    .filter(isTimedItem)
    .map(item => ({ item, start: timeToMinutes(item.time)!, end: timeToMinutes(item.time)! + durationOf(item) }))
    .sort((left, right) => left.start - right.start);

  const colliding = new Set<string>();
  for (let index = 0; index < timed.length; index += 1) {
    for (let other = index + 1; other < timed.length; other += 1) {
      if (timed[other].start >= timed[index].end) break;
      colliding.add(timed[index].item.id);
      colliding.add(timed[other].item.id);
    }
  }
  return Array.from(colliding);
};

/** Whether a proposed span would overlap anything else on the day. */
export const wouldCollide = (
  dayItems: ItineraryItem[],
  movedId: string,
  startMinutes: number,
  durationMinutes: number,
): boolean =>
  dayItems.some(other => {
    if (other.id === movedId || !isTimedItem(other)) return false;
    const otherStart = timeToMinutes(other.time)!;
    return startMinutes < otherStart + durationOf(other) && otherStart < startMinutes + durationMinutes;
  });

/**
 * The nearest snap slot that fits, searched outward from where the user dropped.
 *
 * Preferring the closest free slot respects the intent of the drag — someone who
 * drops at 13:30 wants roughly then, not the end of the day. The search is
 * bounded; if nothing within a couple of hours fits, the caller is told so and
 * lets the drop stand with a warning rather than relocating the item somewhere
 * the user did not ask for.
 */
export const findNearestFreeStart = (
  dayItems: ItineraryItem[],
  movedId: string,
  desiredStart: number,
  durationMinutes: number,
  maxSearchMinutes = 120,
): number | undefined => {
  if (!wouldCollide(dayItems, movedId, desiredStart, durationMinutes)) return desiredStart;
  for (let offset = SNAP_MINUTES; offset <= maxSearchMinutes; offset += SNAP_MINUTES) {
    // Later first: pushing an activity back is the more natural repair.
    const later = desiredStart + offset;
    if (later + durationMinutes <= MINUTES_IN_DAY && !wouldCollide(dayItems, movedId, later, durationMinutes)) return later;
    const earlier = desiredStart - offset;
    if (earlier >= 0 && !wouldCollide(dayItems, movedId, earlier, durationMinutes)) return earlier;
  }
  return undefined;
};

/**
 * Re-sequences a day's times to match the order the cards are in.
 *
 * This is what 「重新安排時間」 runs. It reuses the same scheduler the AI planner
 * uses, so spacing accounts for each activity's duration and the travel between
 * places rather than being evenly spread. The card order is the input and is
 * never changed; only the clock moves, and only when the user asks.
 *
 * The day keeps its existing start: the first card's time is the anchor, so
 * re-sequencing never drags a late-morning plan back to 09:00.
 */
export const resequenceDayTimes = (
  orderedDayItems: ItineraryItem[],
): { items: ItineraryItem[]; changed: boolean } => {
  const timed = orderedDayItems.filter(isTimedItem);
  if (timed.length < 2) return { items: orderedDayItems, changed: false };

  // A day whose times already read forwards is left completely alone. The user
  // may have chosen a long gap on purpose, and re-packing it would destroy that
  // for no reason — there is nothing here to repair.
  const alreadyForwards = timed.every((entry, index) =>
    index === 0 || timed[index - 1].time <= entry.time);
  if (alreadyForwards) return { items: orderedDayItems, changed: false };

  const anchor = timeToMinutes(timed[0].time);
  const scheduled = scheduleProposalDay(
    timed.map(item => ({
      id: item.id,
      placeName: item.location || item.title,
      sourceInspirationIds: [],
      source: 'ai_suggestion' as const,
      // Deliberately handed over untimed: the scheduler orders a day by the
      // clock when it has one, which would undo the very arrangement being
      // re-timed. Without times it keeps the given order and lays fresh times
      // along it, which is exactly what was asked for.
      suggestedStartTime: undefined,
      durationMinutes: item.durationMinutes,
      ...(typeof item.latitude === 'number' && typeof item.longitude === 'number'
        ? { coordinates: { latitude: item.latitude, longitude: item.longitude } }
        : {}),
    })),
    // Keep the day starting where it already starts, and keep the card order:
    // the scheduler must not re-sort the list back into its old sequence.
    { earliestStart: anchor !== undefined ? minutesToTime(anchor) : undefined },
  );

  const byId = new Map(scheduled.items.map(entry => [entry.id, entry.suggestedStartTime]));
  let changed = false;
  const items = orderedDayItems.map(item => {
    const next = byId.get(item.id);
    if (!next || next === item.time) return item;
    changed = true;
    return { ...item, time: next };
  });
  return { items, changed };
};

/* ------------------------------------------------------------------ *
 * Rescheduling: move one item, carry the rest of the day with it
 * ------------------------------------------------------------------ */

/** One drag step. Chosen so a deliberate drag moves a row, not a pixel. */
export const DRAG_STEP_PIXELS = 40;
/** Gap inserted when repairing an overlap that already existed. */
export const DEFAULT_TRANSIT_BUFFER_MINUTES = 15;
/** Past this, the day is late enough to be worth mentioning. */
export const LATE_DAY_BOUNDARY_MINUTES = 22 * 60;

/**
 * How many 30-minute steps a vertical drag represents.
 *
 * The gesture is discrete on purpose: the list is not a ruler, so the distance
 * dragged buys steps rather than mapping to an absolute clock position.
 */
export const stepsFromDragDistance = (deltaY: number, stepPixels: number = DRAG_STEP_PIXELS): number =>
  Math.round(deltaY / stepPixels);

/**
 * Duration used when deciding whether two activities collide.
 *
 * An item with no stated duration contributes nothing here. Inventing an hour
 * for it would push every later activity back by an hour on no evidence, which
 * is precisely the silent rewriting this feature must not do.
 */
const cascadeDurationOf = (item: ItineraryItem): number =>
  typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0
    ? item.durationMinutes
    : 0;

export interface RescheduleResult {
  items: ItineraryItem[];
  changed: boolean;
  /** The time the dragged item actually received, after clamping. */
  startTime?: string;
  /** True when the cascade pushed something past the end-of-day boundary. */
  pushedLate: boolean;
  /** True when the cascade ran into a fixed event it may not move. */
  blockedByFixed: boolean;
}

/**
 * Moves one activity to a new start time and carries the rest of the day with it.
 *
 * The rule that does the work: **the gap between each pair of consecutive
 * activities is preserved**. Someone who left 90 minutes between two places
 * meant to leave 90 minutes, so moving the first an hour earlier moves the
 * second an hour earlier too — it does not collapse the day into a solid block.
 *
 * A gap that was already negative — the activities overlapped before the drag —
 * is the one case that is not preserved, because reproducing an overlap is not
 * respecting an intention. Those are opened to a small transit buffer instead.
 *
 * Only items *after* the dragged one move. Everything earlier is left exactly as
 * it was, and no item's duration, place or notes are touched.
 */
export const rescheduleFromItem = (
  orderedDayItems: ItineraryItem[],
  itemId: string,
  newStartMinutes: number,
  options: { isFixed?: (item: ItineraryItem) => boolean } = {},
): RescheduleResult => {
  const isFixed = options.isFixed ?? (() => false);
  const timed = orderedDayItems.filter(isTimedItem);
  const index = timed.findIndex(entry => entry.id === itemId);
  if (index === -1) return { items: orderedDayItems, changed: false, pushedLate: false, blockedByFixed: false };
  // A fixed event is never dragged. Changing a flight is an explicit edit.
  if (isFixed(timed[index])) return { items: orderedDayItems, changed: false, pushedLate: false, blockedByFixed: true };

  const clampedStart = Math.max(0, Math.min(snapMinutes(newStartMinutes), MINUTES_IN_DAY - SNAP_MINUTES));
  const nextStarts = new Map<string, number>();
  nextStarts.set(timed[index].id, clampedStart);

  let pushedLate = clampedStart > LATE_DAY_BOUNDARY_MINUTES;
  let blockedByFixed = false;

  for (let position = index + 1; position < timed.length; position += 1) {
    const previous = timed[position - 1];
    const current = timed[position];

    // The cascade stops dead at a fixed event: a flight does not move because an
    // earlier museum did. Anything after it keeps its time, and the caller is
    // told the schedule may now be tight rather than having it silently fixed.
    if (isFixed(current)) { blockedByFixed = true; break; }
    const previousOldStart = timeToMinutes(previous.time)!;
    const currentOldStart = timeToMinutes(current.time)!;

    // The gap as the user had it. Negative means they already overlapped.
    const originalGap = currentOldStart - (previousOldStart + cascadeDurationOf(previous));
    const gap = originalGap >= 0 ? originalGap : DEFAULT_TRANSIT_BUFFER_MINUTES;

    const start = Math.min(
      nextStarts.get(previous.id)! + cascadeDurationOf(previous) + gap,
      MINUTES_IN_DAY - SNAP_MINUTES,
    );
    nextStarts.set(current.id, Math.max(0, start));
    if (start > LATE_DAY_BOUNDARY_MINUTES) pushedLate = true;
  }

  let changed = false;
  const items = orderedDayItems.map(entry => {
    const start = nextStarts.get(entry.id);
    if (start === undefined) return entry;
    const time = minutesToTime(start);
    if (time === entry.time && entry.sortOrder === undefined) return entry;
    changed = changed || time !== entry.time;
    // A rescheduled day is chronological by construction, so any hand-made
    // arrangement is dropped rather than left to fight the clock.
    const { sortOrder: _dropped, ...rest } = entry;
    return { ...rest, time };
  });

  return { items, changed, startTime: minutesToTime(clampedStart), pushedLate, blockedByFixed };
};

/**
 * Changes how long an activity takes, and moves what it would now run into.
 *
 * 「後面行程就需要回避掉已經被 book 的時間」. Stretching a 10:00 brunch from an
 * hour to three is a statement about the morning, and the 10:15 after it cannot
 * simply stay where it was.
 *
 * Only later items move, and only the ones actually in the way, by the least
 * that clears them plus the usual transit buffer. Shortening a visit pulls
 * nothing forward: a gap someone left may be a gap they wanted, and recovering
 * half an hour is not worth rearranging a day nobody asked to rearrange.
 *
 * A fixed event stops the cascade exactly as it does for a drag — a flight does
 * not move because a museum ran long — and the caller is told rather than having
 * the clash quietly papered over.
 */
export const applyDurationChange = (
  orderedDayItems: ItineraryItem[],
  itemId: string,
  durationMinutes: number,
  options: { isFixed?: (item: ItineraryItem) => boolean } = {},
): RescheduleResult => {
  const isFixed = options.isFixed ?? (() => false);
  const unchanged: RescheduleResult = { items: orderedDayItems, changed: false, pushedLate: false, blockedByFixed: false };
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return unchanged;

  const target = orderedDayItems.find(entry => entry.id === itemId);
  if (!target || !isTimedItem(target) || target.durationMinutes === durationMinutes) return unchanged;

  const timed = orderedDayItems.filter(isTimedItem);
  const index = timed.findIndex(entry => entry.id === itemId);
  if (index === -1) return unchanged;

  const start = timeToMinutes(target.time)!;
  const nextStarts = new Map<string, number>();
  let cursor = start + durationMinutes;

  /*
    Only a longer activity pushes anything.

    Shortening one leaves the day alone even when something after it still
    overlaps: that clash was there before this edit, it is already marked in
    red, and repairing it is a different decision from the one being made here.
    Nothing is ever pulled earlier — a gap someone left may be a gap they wanted.
  */
  const grew = durationMinutes > durationOf(target);
  let pushedLate = false;
  let blockedByFixed = false;

  for (let position = index + 1; grew && position < timed.length; position += 1) {
    const current = timed[position];
    if (isFixed(current)) { blockedByFixed = true; break; }

    // Out of the way already: everything after it is too, so the cascade ends.
    if (timeToMinutes(current.time)! >= cursor) break;

    const moved = Math.min(
      snapMinutes(cursor + DEFAULT_TRANSIT_BUFFER_MINUTES),
      MINUTES_IN_DAY - SNAP_MINUTES,
    );
    nextStarts.set(current.id, moved);
    if (moved > LATE_DAY_BOUNDARY_MINUTES) pushedLate = true;
    cursor = moved + cascadeDurationOf(current);
  }

  let changed = false;
  const items = orderedDayItems.map(entry => {
    if (entry.id === itemId) {
      changed = true;
      return { ...entry, durationMinutes };
    }
    const start = nextStarts.get(entry.id);
    if (start === undefined) return entry;
    const time = minutesToTime(start);
    if (time === entry.time) return entry;
    changed = true;
    const { sortOrder: _dropped, ...rest } = entry;
    return { ...rest, time };
  });

  return { items, changed, pushedLate, blockedByFixed };
};

/**
 * Does the day, as it stands right now, run past the late boundary?
 *
 * Derived rather than remembered: a notice that survives because a drag once
 * pushed something late would still be on screen after the user fixed it.
 */
export const hasLateItem = (dayItems: ItineraryItem[]): boolean =>
  dayItems.some(item => {
    const start = timeToMinutes(item.time);
    return start !== null && start > LATE_DAY_BOUNDARY_MINUTES;
  });

/**
 * Why two cards are marked as clashing, in words the traveller can act on.
 *
 * 「為何有紅框」. The ring was drawn and never explained, so the only way to
 * learn what it meant was to ask — and in his case the answer was awkward: the
 * 10:00 brunch states no duration, so the app assumed an hour, and then warned
 * him about its own assumption clashing with the 10:15 next door.
 *
 * An overlap between two stated durations is a fact about the plan. An overlap
 * that exists only because of an assumed hour is a fact about the app, and it
 * says which one it is rather than showing the same red for both.
 */
export const describeCollision = (
  item: ItineraryItem,
  dayItems: ItineraryItem[],
): string | undefined => {
  if (!isTimedItem(item)) return undefined;
  const start = timeToMinutes(item.time)!;
  const end = start + durationOf(item);

  const clash = dayItems.find(other => {
    if (other.id === item.id || !isTimedItem(other)) return false;
    const otherStart = timeToMinutes(other.time)!;
    return start < otherStart + durationOf(other) && otherStart < end;
  });
  if (!clash) return undefined;

  const stated = (entry: ItineraryItem) =>
    typeof entry.durationMinutes === 'number' && Number.isFinite(entry.durationMinutes) && entry.durationMinutes > 0;

  return stated(item) && stated(clash)
    ? `和「${clash.title}」的時間重疊`
    : `這裡沒有填停留時間，先以 ${DEFAULT_DURATION_MINUTES} 分鐘估算，和「${clash.title}」重疊了`;
};
