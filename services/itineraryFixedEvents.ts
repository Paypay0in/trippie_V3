import { FixedEventKind, ItineraryItem } from '../types';
import {
  durationOf,
  isTimedItem,
  minutesToTime,
  SNAP_MINUTES,
  snapMinutes,
  timeToMinutes,
} from './itineraryTimeline';

/**
 * Hard time constraints, and what they do to the rest of a day.
 *
 * A flight leaves whether or not the user is at the airport, so it is not
 * negotiable the way an afternoon at a beach is. This module decides which
 * activities are immovable, works out the real deadline a flight imposes, finds
 * what no longer fits, and proposes the smallest set of changes that would.
 *
 * Two rules are absolute:
 *  - A fixed event is never moved to solve a conflict. If two fixed events
 *    cannot both happen, that is reported, not resolved.
 *  - Nothing is applied until the user says so. Building a proposal never
 *    mutates the itinerary.
 */

/** Time to reach the airport when no route estimate is available. */
export const FALLBACK_AIRPORT_TRANSIT_MINUTES = 60;
/** Check-in allowance when the flight record carries none. */
export const DEFAULT_AIRPORT_ARRIVAL_BUFFER_MINUTES = 120;
/** Transit allowance between two ordinary activities when repairing a clash. */
export const DEFAULT_ACTIVITY_TRANSIT_MINUTES = 15;
/** Activities are not pulled earlier than this to make room. */
export const DAY_START_FLOOR_MINUTES = 8 * 60;

/**
 * Whether an activity's time may be moved automatically.
 *
 * A flight-anchor item counts as fixed even without the flag: those are derived
 * from a saved flight, so they were always a hard constraint and predate this
 * model. Absence of the flag otherwise means flexible, which keeps every
 * existing itinerary behaving exactly as it did.
 */
export const isFixedItem = (item: ItineraryItem): boolean => {
  /*
    「除了班機之外的行程都預設不固定」.

    A flight is fixed by nature: miss it and it leaves without you. Everything
    else on a trip can move, and marking it otherwise takes the plan out of the
    traveller's hands — a hotel check-in showed 「住宿 · 固定」 and then reported
    a conflict with the flight that was bringing them there.

    The traveller's own pin still fixes anything they choose. What this refuses
    to do is decide on their behalf for anything but a flight.
  */
  if (item.isPinned === true) return true;
  if (item.derivedFromFlightAnchorId) return true;
  return item.scheduleFlexibility === 'fixed'
    && (item.fixedEventKind === 'flight' || item.type === 'FLIGHT');
};

export const isFlexibleItem = (item: ItineraryItem): boolean => !isFixedItem(item);

export const fixedKindOf = (item: ItineraryItem): FixedEventKind | undefined => {
  if (!isFixedItem(item)) return undefined;
  return item.fixedEventKind || (item.derivedFromFlightAnchorId || item.type === 'FLIGHT' ? 'flight' : undefined);
};

/* ------------------------------------------------------------------ *
 * The deadline a fixed event imposes
 * ------------------------------------------------------------------ */

export interface DepartureBoundaryInput {
  /** When the fixed event starts, in minutes from midnight. */
  eventStartMinutes: number;
  /** Check-in / arrive-before allowance. */
  arrivalBufferMinutes?: number;
  /** Door-to-door travel time to the event, when it is known. */
  transitMinutes?: number;
}

export interface DepartureBoundary {
  /** The last moment a previous activity may still be running. */
  mustLeaveByMinutes: number;
  /** True when travel time was estimated rather than measured. */
  estimated: boolean;
}

/**
 * The real deadline behind an 18:00 flight.
 *
 * An 18:00 departure does not mean a museum until 17:59: there is check-in and
 * there is the journey. Both are subtracted here, and when the journey time is
 * a fallback rather than a route estimate the result says so, because a schedule
 * built on a guess should be presented as one.
 */
export const computeDepartureBoundary = (input: DepartureBoundaryInput): DepartureBoundary => {
  const estimated = typeof input.transitMinutes !== 'number' || !Number.isFinite(input.transitMinutes);
  const transit = estimated ? FALLBACK_AIRPORT_TRANSIT_MINUTES : Math.max(0, input.transitMinutes!);
  const buffer = typeof input.arrivalBufferMinutes === 'number' && Number.isFinite(input.arrivalBufferMinutes)
    ? Math.max(0, input.arrivalBufferMinutes)
    : DEFAULT_AIRPORT_ARRIVAL_BUFFER_MINUTES;
  return { mustLeaveByMinutes: Math.max(0, input.eventStartMinutes - buffer - transit), estimated };
};

/* ------------------------------------------------------------------ *
 * Conflicts
 * ------------------------------------------------------------------ */

export type FixedConflictKind =
  /** A flexible activity runs past the deadline a fixed event imposes. */
  | 'past-deadline'
  /** A flexible activity's span overlaps the fixed event itself. */
  | 'overlaps-fixed'
  /** Two fixed events cannot both happen. Only the user can resolve this. */
  | 'fixed-vs-fixed';

export interface FixedEventConflict {
  kind: FixedConflictKind;
  /** The activity that cannot stay where it is. */
  itemId: string;
  /** The fixed event it conflicts with. */
  fixedItemId: string;
  /** The deadline in play, for explaining the conflict. */
  boundaryMinutes: number;
}

export interface ConflictContext {
  /** Travel time to each fixed event, by item id, when a route was available. */
  transitMinutesByFixedId?: Record<string, number>;
  /** Check-in allowance per fixed event, by item id. */
  arrivalBufferByFixedId?: Record<string, number>;
}

/**
 * The "arrive at the airport" step a flight anchor generates.
 *
 * Its time is already `departure − check-in buffer`, so it carries the buffer
 * rather than needing one subtracted again.
 */
export const isAirportArrivalStep = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) && item.type === 'TRANSPORT';

const boundaryFor = (fixedItem: ItineraryItem, context: ConflictContext): DepartureBoundary => {
  const start = timeToMinutes(fixedItem.time)!;
  const kind = fixedKindOf(fixedItem);
  // Only a journey-type event needs travel-and-check-in subtracted. A booked
  // table is simply a time to be at a place, so the deadline is the time itself.
  // The airport-arrival step is the same: being there on time IS the deadline,
  // and subtracting the buffer twice would invent hours that do not exist.
  if (isAirportArrivalStep(fixedItem) || (kind !== 'flight' && kind !== 'train')) {
    return { mustLeaveByMinutes: start, estimated: false };
  }
  return computeDepartureBoundary({
    eventStartMinutes: start,
    arrivalBufferMinutes: context.arrivalBufferByFixedId?.[fixedItem.id],
    transitMinutes: context.transitMinutesByFixedId?.[fixedItem.id],
  });
};

/**
 * Everything wrong with one day, given its fixed events.
 *
 * Reported rather than repaired: a conflict between two fixed events has no
 * automatic answer, and even a fixable one is the user's to accept.
 */
export const detectFixedEventConflicts = (
  dayItems: ItineraryItem[],
  context: ConflictContext = {},
): FixedEventConflict[] => {
  const timed = dayItems.filter(isTimedItem);
  const fixed = timed.filter(isFixedItem).sort((left, right) => left.time.localeCompare(right.time));
  if (fixed.length === 0) return [];

  const conflicts: FixedEventConflict[] = [];

  // Fixed against fixed: nothing here can be moved, so this is purely a report.
  for (let index = 0; index + 1 < fixed.length; index += 1) {
    const earlier = fixed[index];
    const later = fixed[index + 1];
    // Two steps of the SAME flight (arrive at airport, then depart) are one
    // journey, not two competing commitments. Comparing them reported the
    // traveller as being in conflict with their own check-in.
    if (
      earlier.derivedFromFlightAnchorId
      && earlier.derivedFromFlightAnchorId === later.derivedFromFlightAnchorId
    ) continue;
    const earlierEnd = timeToMinutes(earlier.time)! + durationOf(earlier);
    const laterBoundary = boundaryFor(later, context).mustLeaveByMinutes;
    if (earlierEnd > laterBoundary) {
      conflicts.push({
        kind: 'fixed-vs-fixed',
        itemId: earlier.id,
        fixedItemId: later.id,
        boundaryMinutes: laterBoundary,
      });
    }
  }

  // Flexible against each fixed event.
  timed.filter(isFlexibleItem).forEach(item => {
    const start = timeToMinutes(item.time)!;
    const end = start + durationOf(item);
    fixed.forEach(fixedItem => {
      const fixedStart = timeToMinutes(fixedItem.time)!;
      const fixedEnd = fixedStart + durationOf(fixedItem);
      const boundary = boundaryFor(fixedItem, context).mustLeaveByMinutes;

      if (start < fixedEnd && fixedStart < end) {
        conflicts.push({ kind: 'overlaps-fixed', itemId: item.id, fixedItemId: fixedItem.id, boundaryMinutes: boundary });
        return;
      }
      // Only activities that should precede the event can miss its deadline.
      if (start < fixedStart && end > boundary) {
        conflicts.push({ kind: 'past-deadline', itemId: item.id, fixedItemId: fixedItem.id, boundaryMinutes: boundary });
      }
    });
  });

  return conflicts;
};

/* ------------------------------------------------------------------ *
 * Proposal
 * ------------------------------------------------------------------ */

export interface AdjustmentChange {
  type: 'move' | 'moveToDay';
  itemId: string;
  fromTime: string;
  toTime?: string;
  fromDate?: string;
  toDate?: string;
  reason: string;
}

export interface FixedEventAdjustment {
  changes: AdjustmentChange[];
  /** Conflicts no automatic change can fix — the user must decide. */
  unresolved: FixedEventConflict[];
  warnings: string[];
  summary: string;
}

/** Start times relative to the first item, so gaps survive a shift. */
const relativeOffsets = (items: ItineraryItem[]): number[] => {
  const first = timeToMinutes(items[0].time)!;
  return items.map(item => timeToMinutes(item.time)! - first);
};

/**
 * Proposes the smallest set of changes that would make a day work.
 *
 * The approach is deliberately conservative. It first tries to keep every
 * activity, shifting the whole flexible block earlier by just enough to clear
 * the deadline while preserving the gaps the user chose. Only when even that
 * cannot fit — without starting the day before DAY_START_FLOOR_MINUTES — does it
 * propose moving the trailing activities to another day, dropping one at a time
 * from the end until the rest fit.
 *
 * It never compresses activities to squeeze them in: a day that genuinely does
 * not fit should lose an activity to another day, not become a sprint.
 */
export const buildFixedEventAdjustment = (
  dayItems: ItineraryItem[],
  context: ConflictContext & { previousDate?: string } = {},
): FixedEventAdjustment => {
  const timed = dayItems.filter(isTimedItem);
  const fixed = timed.filter(isFixedItem).sort((left, right) => left.time.localeCompare(right.time));
  const conflicts = detectFixedEventConflicts(dayItems, context);
  const unresolved = conflicts.filter(conflict => conflict.kind === 'fixed-vs-fixed');

  const warnings: string[] = [];
  if (fixed.some(item => boundaryFor(item, context).estimated && (fixedKindOf(item) === 'flight' || fixedKindOf(item) === 'train'))) {
    warnings.push('交通時間為估算值，請再次確認。');
  }

  if (fixed.length === 0 || conflicts.length === unresolved.length) {
    return {
      changes: [],
      unresolved,
      warnings,
      summary: unresolved.length > 0 ? '目前有兩個固定行程發生衝突' : '目前行程沒有需要調整的地方。',
    };
  }

  // The earliest deadline governs everything before it.
  const governing = fixed.reduce((earliest, item) =>
    boundaryFor(item, context).mustLeaveByMinutes < boundaryFor(earliest, context).mustLeaveByMinutes ? item : earliest);
  const boundary = boundaryFor(governing, context).mustLeaveByMinutes;
  const governingStart = timeToMinutes(governing.time)!;

  // Flexible activities that are meant to happen before the fixed event.
  const before = timed
    .filter(item => isFlexibleItem(item) && timeToMinutes(item.time)! < governingStart)
    .sort((left, right) => left.time.localeCompare(right.time));
  if (before.length === 0) {
    return { changes: [], unresolved, warnings, summary: '目前行程沒有需要調整的地方。' };
  }

  const offsets = relativeOffsets(before);
  const originalFirstStart = timeToMinutes(before[0].time)!;

  for (let keep = before.length; keep >= 1; keep -= 1) {
    const kept = before.slice(0, keep);
    const span = offsets[keep - 1] + durationOf(kept[keep - 1]);
    const latestStart = boundary - span;
    if (latestStart < DAY_START_FLOOR_MINUTES) continue;

    // Only ever pull earlier; an activity that already fits keeps its time.
    const newFirstStart = snapMinutes(Math.min(originalFirstStart, latestStart));
    const changes: AdjustmentChange[] = [];

    kept.forEach((item, index) => {
      const nextStart = newFirstStart + offsets[index];
      const nextTime = minutesToTime(nextStart);
      if (nextTime === item.time) return;
      changes.push({
        type: 'move',
        itemId: item.id,
        fromTime: item.time,
        toTime: nextTime,
        reason: '需預留機場交通與報到時間。',
      });
    });

    before.slice(keep).forEach(item => {
      changes.push({
        type: 'moveToDay',
        itemId: item.id,
        fromTime: item.time,
        fromDate: item.date,
        toDate: context.previousDate,
        reason: '當日已無足夠時間，建議改到其他日期。',
      });
    });

    return {
      changes,
      unresolved,
      warnings,
      summary: `為了預留前往機場與報到時間，我們建議調整 ${changes.length} 個行程。`,
    };
  }

  // Not even one activity fits before the deadline.
  return {
    changes: before.map(item => ({
      type: 'moveToDay' as const,
      itemId: item.id,
      fromTime: item.time,
      fromDate: item.date,
      toDate: context.previousDate,
      reason: '當日已無足夠時間，建議改到其他日期。',
    })),
    unresolved,
    warnings,
    summary: `為了預留前往機場與報到時間，我們建議調整 ${before.length} 個行程。`,
  };
};

/**
 * Applies a proposal to the whole itinerary, by stable id.
 *
 * A fixed item is refused even if a proposal names one, so a hand-built or stale
 * proposal cannot move a flight. An item whose id has vanished is skipped rather
 * than guessed at.
 */
export const applyFixedEventAdjustment = (
  itinerary: ItineraryItem[],
  adjustment: FixedEventAdjustment,
): { items: ItineraryItem[]; changed: boolean } => {
  const byId = new Map(itinerary.map(item => [item.id, item]));
  const patches = new Map<string, Partial<ItineraryItem>>();

  adjustment.changes.forEach(change => {
    const target = byId.get(change.itemId);
    if (!target || isFixedItem(target)) return;
    if (change.type === 'move' && change.toTime) {
      patches.set(change.itemId, { time: change.toTime });
      return;
    }
    if (change.type === 'moveToDay' && change.toDate) {
      patches.set(change.itemId, { date: change.toDate });
    }
  });

  if (patches.size === 0) return { items: itinerary, changed: false };
  return {
    items: itinerary.map(item => {
      const patch = patches.get(item.id);
      // A rearranged day is chronological again, so a stale hand-made order goes.
      if (!patch) return item;
      const { sortOrder: _dropped, ...rest } = item;
      return { ...rest, ...patch };
    }),
    changed: true,
  };
};

/**
 * The earliest fixed event a cascade may not push past.
 * Used by manual drag so shifting an activity can never move a flight.
 */
export const nextFixedBoundaryAfter = (
  dayItems: ItineraryItem[],
  afterMinutes: number,
  context: ConflictContext = {},
): number | undefined => {
  const candidates = dayItems
    .filter(item => isTimedItem(item) && isFixedItem(item) && timeToMinutes(item.time)! > afterMinutes)
    .map(item => boundaryFor(item, context).mustLeaveByMinutes)
    .filter(boundary => boundary > afterMinutes);
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
};

export { SNAP_MINUTES };

/**
 * Which two items are actually in conflict, by name.
 *
 * The banner printed 「目前有兩個固定行程發生衝突」 as its heading and then again
 * as its body — the same sentence twice, saying nothing either time. A
 * traveller looking at a day with six cards still has to work out which two,
 * and that is the only thing they need.
 */
export const describeUnresolvedConflicts = (
  unresolved: FixedEventConflict[],
  items: Array<{ id: string; title: string }>,
): string => {
  const titleOf = (id: string) => items.find(item => item.id === id)?.title;

  const pairs = unresolved
    .map(conflict => [titleOf(conflict.itemId), titleOf(conflict.fixedItemId)])
    .filter((pair): pair is [string, string] => Boolean(pair[0] && pair[1]))
    // The same two items can collide on more than one boundary; saying so
    // twice is the problem this function exists to fix.
    .filter((pair, index, all) =>
      all.findIndex(other => other[0] === pair[0] && other[1] === pair[1]) === index);

  if (pairs.length === 0) return '';
  if (pairs.length === 1) return `「${pairs[0][0]}」和「${pairs[0][1]}」的時間互相衝突。`;
  return pairs.map(pair => `「${pair[0]}」和「${pair[1]}」`).join('、') + ' 的時間互相衝突。';
};
