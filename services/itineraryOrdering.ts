import { ItineraryItem } from '../types';

/**
 * Ordering of itinerary items within a day, and the moves a drag can make.
 *
 * Everything here is pure and addresses items by their stable id — never by
 * display name and never by array index, so a card that shares a name with
 * another, or a list that re-sorts underneath, cannot move the wrong thing.
 *
 * The ordering contract is deliberately additive. Before anyone drags, no item
 * has a `sortOrder` and a day renders chronologically exactly as it always has.
 * The moment a day is reordered, every item in that day gets an explicit
 * `sortOrder`, and from then on that day is ordered by the user's intent rather
 * than by the clock — which is the whole point of being able to drag.
 */

const timeKey = (item: ItineraryItem): string => item.time || '99:99';

/*
  Which card goes first when two share a minute.

  「先離開機場才會去旅館入住」. A journey and the arrival it produces can land on
  the same clock value, and the clock alone cannot separate them — so the day
  showed 入住 above 前往飯店, which reads as checking in before the car. Getting
  somewhere comes before being there, whatever the times say.
*/
const SAME_MINUTE_RANK: Partial<Record<ItineraryItem['type'], number>> = {
  FLIGHT: 0,
  TRANSPORT: 1,
  HOTEL: 2,
};

const rankOf = (item: ItineraryItem): number => SAME_MINUTE_RANK[item.type] ?? 1.5;

const byTimeThenArrivalLast = (left: ItineraryItem, right: ItineraryItem): number => {
  const byTime = timeKey(left).localeCompare(timeKey(right));
  return byTime !== 0 ? byTime : rankOf(left) - rankOf(right);
};

/** Items belonging to one day. An undated day is the "no date" bucket. */
export const itemsForDay = (itinerary: ItineraryItem[], date?: string): ItineraryItem[] =>
  itinerary.filter(item => (date ? item.date === date : !item.date));

/**
 * The order a day should render in.
 *
 * A day nobody has arranged by hand sorts by time. Once any item carries a
 * `sortOrder`, that becomes the authority — the list is a journey order the user
 * chose, not a calendar, so a 17:00 card may sit above a 14:30 one. When that
 * happens the times are no longer chronological, and the UI says so rather than
 * quietly rewriting them.
 *
 * An item with no `sortOrder` in an arranged day is placed after the arranged
 * ones, keeping its relative chronological position, so something added later
 * never jumps into the middle of a hand-made plan.
 */
export const orderItemsForDay = (items: ItineraryItem[]): ItineraryItem[] => {
  const hasExplicitOrder = items.some(item => typeof item.sortOrder === 'number');
  if (!hasExplicitOrder) {
    return [...items].sort(byTimeThenArrivalLast);
  }
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftOrder = typeof left.item.sortOrder === 'number' ? left.item.sortOrder : Number.POSITIVE_INFINITY;
      const rightOrder = typeof right.item.sortOrder === 'number' ? right.item.sortOrder : Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      const byTime = byTimeThenArrivalLast(left.item, right.item);
      return byTime !== 0 ? byTime : left.index - right.index;
    })
    .map(entry => entry.item);
};

/** Stamps 0..n-1 onto a day, making the arrangement explicit and gap-free. */
const withSequentialOrder = (ordered: ItineraryItem[]): ItineraryItem[] =>
  ordered.map((item, index) => (item.sortOrder === index ? item : { ...item, sortOrder: index }));

/**
 * Rebuilds the whole itinerary with one day replaced, preserving every item
 * outside that day byte-for-byte.
 */
const replaceDay = (
  itinerary: ItineraryItem[],
  date: string | undefined,
  nextDayItems: ItineraryItem[],
): ItineraryItem[] => {
  const nextById = new Map(nextDayItems.map(item => [item.id, item]));
  const belongsToDay = (item: ItineraryItem) => (date ? item.date === date : !item.date);
  const result: ItineraryItem[] = [];
  let inserted = false;
  itinerary.forEach(item => {
    if (belongsToDay(item) || nextById.has(item.id)) {
      // The day's items are emitted together, in their new order, at the position
      // the day first appeared. Everything else keeps its place in the array.
      if (!inserted) { result.push(...nextDayItems); inserted = true; }
      return;
    }
    result.push(item);
  });
  if (!inserted) result.push(...nextDayItems);
  return result;
};

export interface ReorderResult {
  items: ItineraryItem[];
  /** False when the move was impossible or a no-op; the caller should do nothing. */
  changed: boolean;
}

/**
 * Moves an item to a new position inside its own day.
 *
 * `toIndex` is a position in the day's *rendered* order. A target beyond the end
 * appends. An unknown id changes nothing rather than guessing.
 */
export const reorderWithinDay = (
  itinerary: ItineraryItem[],
  itemId: string,
  toIndex: number,
): ReorderResult => {
  const moved = itinerary.find(item => item.id === itemId);
  if (!moved) return { items: itinerary, changed: false };

  const ordered = orderItemsForDay(itemsForDay(itinerary, moved.date));
  const fromIndex = ordered.findIndex(item => item.id === itemId);
  if (fromIndex === -1) return { items: itinerary, changed: false };

  const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1));
  if (clamped === fromIndex) return { items: itinerary, changed: false };

  const next = [...ordered];
  next.splice(fromIndex, 1);
  next.splice(clamped, 0, moved);

  return { items: replaceDay(itinerary, moved.date, withSequentialOrder(next)), changed: true };
};

/**
 * Moves an item to another day, at a chosen position.
 *
 * The item is removed from its old day and inserted into the new one — the same
 * object, carrying the same id, so nothing is ever duplicated. Its time is not
 * touched: a v1 drag changes where an activity sits, not when it happens.
 */
export const moveItemToDay = (
  itinerary: ItineraryItem[],
  itemId: string,
  toDate: string,
  toIndex = Number.MAX_SAFE_INTEGER,
): ReorderResult => {
  const moved = itinerary.find(item => item.id === itemId);
  if (!moved) return { items: itinerary, changed: false };
  if (moved.date === toDate) return reorderWithinDay(itinerary, itemId, toIndex);

  const fromDate = moved.date;
  const relocated: ItineraryItem = { ...moved, date: toDate };

  // Source day: closes the gap left behind, and only renumbers a day that was
  // already arranged by hand.
  const sourceRemaining = orderItemsForDay(itemsForDay(itinerary, fromDate)).filter(item => item.id !== itemId);
  const sourceHadOrder = sourceRemaining.some(item => typeof item.sortOrder === 'number');
  const nextSource = sourceHadOrder ? withSequentialOrder(sourceRemaining) : sourceRemaining;

  // Target day: an explicit drop position makes the arrangement explicit.
  const targetOrdered = orderItemsForDay(itemsForDay(itinerary, toDate));
  const clamped = Math.max(0, Math.min(toIndex, targetOrdered.length));
  const nextTarget = [...targetOrdered];
  nextTarget.splice(clamped, 0, relocated);

  const withoutMoved = itinerary.filter(item => item.id !== itemId);
  const afterSource = replaceDay(withoutMoved, fromDate, nextSource);
  return { items: replaceDay(afterSource, toDate, withSequentialOrder(nextTarget)), changed: true };
};

/**
 * True when a sequence of items disagrees with its own clock.
 *
 * This is the signal behind 「行程順序已更新，請確認時間安排。」 — the user put an
 * activity somewhere the times do not support, and is told so rather than having
 * their times silently rewritten to match.
 *
 * The array is judged **in the order given**. It deliberately does not re-sort:
 * re-deriving the order would recover a chronological sequence and report no
 * conflict, which is exactly the question being asked. Callers pass the day as it
 * will be rendered — `orderItemsForDay` first if it is not already arranged.
 * Untimed items are skipped; they cannot be out of order against a time they
 * do not have.
 */
export const hasTimeOrderConflict = (orderedItems: ItineraryItem[]): boolean => {
  const timed = orderedItems.filter(item => /^\d{2}:\d{2}$/.test(item.time || ''));
  for (let index = 0; index + 1 < timed.length; index += 1) {
    if (timed[index].time > timed[index + 1].time) return true;
  }
  return false;
};

/**
 * Ids of the items sitting out of chronological sequence, for optional marking.
 * Judged in the order given, for the same reason as hasTimeOrderConflict.
 */
export const timeConflictItemIds = (orderedItems: ItineraryItem[]): string[] => {
  const timed = orderedItems.filter(item => /^\d{2}:\d{2}$/.test(item.time || ''));
  const flagged: string[] = [];
  for (let index = 0; index + 1 < timed.length; index += 1) {
    if (timed[index].time > timed[index + 1].time) {
      flagged.push(timed[index].id, timed[index + 1].id);
    }
  }
  return Array.from(new Set(flagged));
};
