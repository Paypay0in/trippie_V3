import { ProposedItineraryItem } from './itineraryPlanningService';
import { distanceInKm, PlaceCoordinates } from './tripInspirationSelection';

/**
 * Turns one proposed day into a schedule a person could actually follow.
 *
 * The model is trusted for *what* to do and in *what order*, not for the clock.
 * It routinely emits the same start time for every activity on a day, which is
 * not a usable itinerary, so the times it returns are treated as a suggestion
 * that must survive a feasibility check rather than as data.
 *
 * The rules, in order of authority:
 *  - A valid model time that is not earlier than the running earliest-possible
 *    start is kept exactly. A day the model already scheduled sensibly comes out
 *    of here untouched.
 *  - A missing, duplicated, out-of-order or overlapping time is replaced with the
 *    earliest feasible start: the previous activity's end plus travel time.
 *  - An activity that no longer fits inside the day is left untimed rather than
 *    stacked on top of another one. Losing a time is honest; a fake time is not.
 */

/**
 * Where a day is assumed to begin when no time is known at all.
 *
 * This is an anchor, never a floor: a model that deliberately schedules an 08:05
 * fish market keeps it. Only the user saying 「每天 11 點後出門」 sets a hard minimum.
 */
export const DEFAULT_DAY_START = '09:00';
/** Nothing is auto-scheduled to begin after this. */
export const DAY_END = '22:00';
/** Assumed length of an activity whose proposal carried no duration. */
export const DEFAULT_VISIT_MINUTES = 90;
/** Travel allowance between two activities with no usable coordinates. */
export const DEFAULT_TRANSIT_MINUTES = 30;
/** Fixed overhead on any hop: leaving, finding the way, arriving. */
const TRANSIT_BASE_MINUTES = 15;
/** Rough city travel pace. 20km/h door to door covers transit, walking and waiting. */
const TRANSIT_MINUTES_PER_KM = 3;
const MAX_TRANSIT_MINUTES = 120;

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const toClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Rounds up to the next quarter hour, because 13:07 reads as machine output. */
const roundUpToQuarter = (minutes: number): number => Math.ceil(minutes / 15) * 15;

/**
 * How long to allow between leaving one place and starting the next. Distance is
 * used when both places are locatable; otherwise a flat allowance applies. This
 * is a buffer, not route optimization — it only has to be defensible.
 */
export const transitMinutesBetween = (from?: PlaceCoordinates, to?: PlaceCoordinates): number => {
  if (!from || !to) return DEFAULT_TRANSIT_MINUTES;
  const distance = distanceInKm(from, to);
  if (!Number.isFinite(distance)) return DEFAULT_TRANSIT_MINUTES;
  return Math.min(MAX_TRANSIT_MINUTES, Math.round(TRANSIT_BASE_MINUTES + distance * TRANSIT_MINUTES_PER_KM));
};

/**
 * Reads a "don't start before N o'clock" instruction out of the user's own words,
 * e.g. 「每天 11 點後出門」/「11點才出門」/「start after 11」.
 *
 * Deliberately narrow. The hour must sit next to an explicit start-of-day word, so
 * 「想安排 2 小時的汗蒸幕」 and 「17 點看夕陽」 cannot be misread as a day start. When
 * nothing matches, the default applies and the model keeps whatever it chose.
 */
export const parseEarliestStartPreference = (preferences?: string): string | undefined => {
  if (!preferences?.trim()) return undefined;
  const text = preferences.replace(/：/g, ':');

  // 「11 點後出門」「11點才出發」「11:30 以後再出門」— hour first, intent word after.
  const chinese = text.match(/(\d{1,2})\s*(?::\s*([0-5]\d))?\s*點?\s*(?:半)?\s*(?:以後|之後|後|才|再)?\s*(?:才|再)?\s*(?:出門|出發|開始|起床|活動)/);
  // 「出門時間 11 點」「start after 11am」
  const english = text.match(/(?:after|from|start(?:ing)?\s+(?:at|after))\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?/i);
  const match = chinese || english;
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : (/半/.test(match[0]) ? 30 : 0);
  if (english && !chinese && /pm/i.test(match[3] || '') && hour < 12) hour += 12;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return undefined;
  return toClock(hour * 60 + minute);
};

export interface DayScheduleOptions {
  /** Free-text guidance the user typed; only a day-start instruction is read from it. */
  planningPreferences?: string;
  /**
   * A hard minimum for the day's first activity. Unlike DEFAULT_DAY_START this
   * does override a valid model time, because it came from the user.
   */
  earliestStart?: string;
}

export interface DayScheduleResult {
  items: ProposedItineraryItem[];
  /** True when any time was replaced, so the caller can warn rather than stay silent. */
  repaired: boolean;
}

const isValidClock = (value?: string): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/**
 * Orders the day, then walks it assigning the earliest feasible start to anything
 * the model left unusable. Returns new item objects; the input is not mutated.
 */
export const scheduleProposalDay = (
  items: ProposedItineraryItem[],
  options: DayScheduleOptions = {},
): DayScheduleResult => {
  if (items.length === 0) return { items, repaired: false };

  // A user instruction is a floor the model does not get to overrule. Without one
  // there is no floor at all — an early start the model chose on purpose is kept.
  // Two floors can apply at once: a flight that lands at 19:55 and a user who
  // does not leave before 11:00. The later one wins — satisfying it satisfies both.
  const preferenceFloor = parseEarliestStartPreference(options.planningPreferences);
  const floorMinutes = Math.max(
    options.earliestStart ? toMinutes(options.earliestStart) : 0,
    preferenceFloor ? toMinutes(preferenceFloor) : 0,
  );
  const dayEndMinutes = toMinutes(DAY_END);

  // Timed items first, in clock order; untimed ones keep the order the model gave
  // them, which is the only ordering signal they carry. Array.prototype.sort is
  // stable, so equal keys — the all-09:00 case — preserve the model's sequence.
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftTime = isValidClock(left.item.suggestedStartTime) ? toMinutes(left.item.suggestedStartTime) : Number.POSITIVE_INFINITY;
      const rightTime = isValidClock(right.item.suggestedStartTime) ? toMinutes(right.item.suggestedStartTime) : Number.POSITIVE_INFINITY;
      return leftTime === rightTime ? left.index - right.index : leftTime - rightTime;
    })
    .map(entry => entry.item);

  let repaired = false;
  // The earliest an activity may begin. For the first one that is the user's floor
  // (or nothing); afterwards it is the previous activity's end plus travel.
  let earliestNext = floorMinutes;
  let previous: ProposedItineraryItem | undefined;

  const scheduled = ordered.map(item => {
    if (previous) {
      earliestNext += transitMinutesBetween(previous.coordinates, item.coordinates);
      earliestNext = roundUpToQuarter(earliestNext);
    }

    const proposed = isValidClock(item.suggestedStartTime) ? toMinutes(item.suggestedStartTime) : undefined;
    // The model's own time wins whenever it is actually possible. This is what
    // keeps an already-sensible day byte-identical.
    const keepsModelTime = proposed !== undefined && proposed >= earliestNext;
    // Only when a time has to be invented does the day-start anchor apply, and
    // only to the first activity — a later one follows whatever preceded it.
    const start = keepsModelTime
      ? proposed
      : Math.max(earliestNext, previous ? 0 : toMinutes(DEFAULT_DAY_START));

    // The day-end cutoff bounds times this function invents, never one the model
    // chose. A 23:30 night market is a real plan; an activity pushed past midnight
    // by a chain of repairs is not, and is better left untimed for the user to place.
    if (!keepsModelTime && start > dayEndMinutes) {
      repaired = true;
      previous = item;
      earliestNext = start + (item.durationMinutes || DEFAULT_VISIT_MINUTES);
      return { ...item, suggestedStartTime: undefined };
    }

    if (!keepsModelTime) repaired = true;
    previous = item;
    earliestNext = start + (item.durationMinutes || DEFAULT_VISIT_MINUTES);
    return start === proposed ? item : { ...item, suggestedStartTime: toClock(start) };
  });

  return { items: scheduled, repaired };
};
