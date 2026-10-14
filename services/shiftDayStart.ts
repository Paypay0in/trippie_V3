/**
 * Moving a whole day later, because the traveller said what time they leave.
 *
 * 「橘色處調 紅色處是不是就要調」 — 幾點出門 was set to 11:00 and the first block
 * still read 10:00. The grid was doing something deliberate and saying nothing
 * about it: `buildDayTemplate` opens the day at the earliest item already on
 * it, so that an item at 10:00 on a day starting at 11:00 still has a block to
 * sit in rather than reading as deleted. Correct, and completely invisible —
 * from the outside the input simply did nothing.
 *
 * What was missing is the other half: if the day is to start later, the things
 * on it move. Every movable item shifts by the same amount, so the gaps the
 * traveller arranged are preserved — this is a translation of the day, not a
 * re-plan of it.
 *
 * Flights and check-ins never move. 「航班時間是固定的行程」: they are the thing
 * the day is built around, and an app that quietly re-timed a boarding pass
 * would be worse than one that did nothing.
 */
import { ItineraryItem } from '../types';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toMinutes = (time?: string): number | undefined => {
  const match = CLOCK.exec((time || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

const toClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** A flight or a check-in: the day is built around it, so it does not move. */
const isFixed = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) || item.type === 'FLIGHT';

export interface DayShift {
  items: ItineraryItem[];
  /** How many items moved. Zero means there was nothing to do. */
  movedCount: number;
  /** Minutes everything moved by, for saying so before doing it. */
  shiftMinutes: number;
}

/**
 * @param start the time the traveller typed into 幾點出門.
 *
 * Returns the day unchanged when the earliest movable item already starts at
 * or after that time: this moves a day later, and dragging a plan *earlier*
 * into the morning is a different decision that nobody asked for.
 */
export const shiftDayToStart = (dayItems: ItineraryItem[], start: string): DayShift => {
  const target = toMinutes(start);
  const unchanged = { items: dayItems, movedCount: 0, shiftMinutes: 0 };
  if (target === undefined) return unchanged;

  const movable = dayItems.filter(item => !isFixed(item) && toMinutes(item.time) !== undefined);
  if (movable.length === 0) return unchanged;

  const earliest = Math.min(...movable.map(item => toMinutes(item.time) as number));
  const shiftMinutes = target - earliest;
  if (shiftMinutes <= 0) return unchanged;

  /*
    Nothing is pushed past midnight. A day that cannot absorb the shift keeps
    its plan rather than wrapping an evening into the small hours — the
    traveller can see the times and decide, which is more than a silent
    wrap-around would let them do.
  */
  const wouldOverflow = movable.some(item => (toMinutes(item.time) as number) + shiftMinutes >= 24 * 60);
  if (wouldOverflow) return unchanged;

  let movedCount = 0;
  const items = dayItems.map(item => {
    if (isFixed(item)) return item;
    const minutes = toMinutes(item.time);
    if (minutes === undefined) return item;
    movedCount += 1;
    return { ...item, time: toClock(minutes + shiftMinutes) };
  });

  return { items, movedCount, shiftMinutes };
};
