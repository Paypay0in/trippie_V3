/**
 * Two things at the same time, after an AI adjustment.
 *
 * Measured against the live route: asked to fix a day that zigzagged across
 * Tokyo, the model returned 「move KITTE丸之內 → 14:30」 and 「move 豪德寺 → 12:00」.
 * The order it chose was right — it swapped the two stops that made the day
 * cross the city — but 代官山 was already sitting at 14:30, so applying it put
 * two places in one slot. The model is reasoning about sequence; it is not
 * keeping a seating chart.
 *
 * So the day is tidied after the fact rather than argued about in the prompt.
 * The order the AI chose is kept exactly; only the clock moves, and only
 * forwards, by the least that separates them.
 *
 * Nothing fixed is ever moved. 「航班時間是固定的行程」 — a flight, anything
 * derived from one, and anything the traveller pinned by hand are what the day
 * is built around, so an overlap with one of those is resolved by moving the
 * other thing.
 */
import { ItineraryItem } from '../types';
import { durationOf, isTimedItem, minutesToTime, timeToMinutes } from './itineraryTimeline';

const isFixed = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) || item.type === 'FLIGHT' || Boolean(item.isPinned);

/**
 * Pushes overlapping items later until a day reads one thing at a time.
 *
 * @returns the items, and how many had to move.
 */
export const separateOverlaps = (
  items: ItineraryItem[],
): { items: ItineraryItem[]; movedCount: number } => {
  const byDate = new Map<string, ItineraryItem[]>();
  items.forEach(item => {
    if (!isTimedItem(item) || !item.date) return;
    byDate.set(item.date, [...(byDate.get(item.date) || []), item]);
  });

  const moved = new Map<string, string>();

  byDate.forEach(dayItems => {
    const ordered = [...dayItems].sort((left, right) => {
      const leftStart = timeToMinutes(left.time) ?? 0;
      const rightStart = timeToMinutes(right.time) ?? 0;
      // Ties break on the fixed item, so the thing that cannot move goes first
      // and everything else is pushed around it rather than through it.
      return leftStart - rightStart || (isFixed(left) ? -1 : isFixed(right) ? 1 : 0);
    });

    let freeFrom: number | undefined;
    ordered.forEach(item => {
      const start = timeToMinutes(moved.get(item.id) ?? item.time);
      if (start === undefined) return;
      const length = durationOf(item);

      if (freeFrom !== undefined && start < freeFrom && !isFixed(item)) {
        /*
          Pushed to exactly where the previous item ends — the least move that
          separates them. A day that would run past midnight is left alone:
          wrapping an evening into the small hours is worse than an overlap the
          traveller can see and fix.
        */
        const pushed = freeFrom;
        if (pushed + length < 24 * 60) {
          moved.set(item.id, minutesToTime(pushed));
          freeFrom = pushed + length;
          return;
        }
      }

      freeFrom = Math.max(freeFrom ?? 0, start + length);
    });
  });

  if (moved.size === 0) return { items, movedCount: 0 };
  return {
    items: items.map(item => (moved.has(item.id) ? { ...item, time: moved.get(item.id) as string } : item)),
    movedCount: moved.size,
  };
};
