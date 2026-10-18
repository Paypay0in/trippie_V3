/**
 * The one tap behind 「把同一區的行程排在一起可以省掉一趟」.
 *
 * 「第一條建議要給一個一鍵」. The check already works out that a day crosses back
 * into an area it has left — 「Taito City 今天跑了兩趟」 — and then asks the
 * traveller to fix it by hand, which means dragging cards until the sentence
 * stops appearing. The advice and the repair are the same arithmetic.
 *
 * Reorders only; nothing is added, removed or moved to another day. The stops
 * keep their own lengths and the day keeps its own start, so what changes is
 * the sequence and nothing else.
 */
import { ItineraryItem } from '../types';
import { orderByProximity } from './optimiseTripRoute';
import { transitMinutesBetween } from './itineraryScheduling';
import { durationOf, isTimedItem, minutesToTime, timeToMinutes } from './itineraryTimeline';

const located = (item: ItineraryItem): boolean =>
  typeof item.latitude === 'number' && typeof item.longitude === 'number';

/**
 * New start times by item id, or nothing when the day is already as good.
 *
 * @param isFixed flights, check-ins and anything pinned. They are the day's
 *   skeleton: they keep their hour, and the free stops are laid out after the
 *   last of them that has already happened.
 */
export const groupDayByArea = (
  items: ItineraryItem[],
  isFixed: (item: ItineraryItem) => boolean,
): Record<string, string> => {
  const timed = items.filter(item => isTimedItem(item));
  const movable = timed
    .filter(item => !isFixed(item) && located(item))
    .sort((left, right) => (timeToMinutes(left.time) ?? 0) - (timeToMinutes(right.time) ?? 0));
  if (movable.length < 3) return {};

  const opensAt = timeToMinutes(movable[0].time);
  if (opensAt === undefined) return {};

  /*
    The original end, which the reordering may not run past.

    A day that walks less but finishes an hour later has not been improved, it
    has been extended — and the hour it borrows is usually the one somebody
    has a flight in.
  */
  const closesAt = Math.max(...movable.map(item => (timeToMinutes(item.time) ?? 0) + durationOf(item)));

  const ordered = orderByProximity(movable);
  // Already in this order: nothing to offer, and no write to make.
  if (ordered.every((item, index) => item.id === movable[index].id)) return {};

  const next: Record<string, string> = {};
  let cursor = opensAt;
  let previous: { latitude: number; longitude: number } | undefined;

  for (const item of ordered) {
    if (previous && located(item)) {
      cursor += transitMinutesBetween(previous, {
        latitude: item.latitude as number,
        longitude: item.longitude as number,
      });
    }
    if (cursor + durationOf(item) > closesAt) return {};
    next[item.id] = minutesToTime(cursor);
    cursor += durationOf(item);
    if (located(item)) {
      previous = { latitude: item.latitude as number, longitude: item.longitude as number };
    }
  }

  // Only the ones that actually move: a write per unchanged item is a write
  // that can still fail, for no gain.
  Object.keys(next).forEach(id => {
    const before = timed.find(item => item.id === id)?.time;
    if (before === next[id]) delete next[id];
  });

  return next;
};
