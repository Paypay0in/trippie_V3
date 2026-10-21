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
import { LATEST_EXTENSION } from './dayTemplate';

/** The latest a stop may be pushed to start. See `dayTemplate`. */
const LATEST_START_MINUTES = timeToMinutes(LATEST_EXTENSION) ?? 23 * 60;
import { earliestFreeStartByDate, fixedAnchorSchedule, TRANSFER_ID_PREFIX } from './itineraryDayFloor';

const isFixed = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) || item.type === 'FLIGHT' || Boolean(item.isPinned)
  // The ride to the room: an addition clashing with it moves, not it.
  || item.id.startsWith(TRANSFER_ID_PREFIX);

/**
 * A time for the items this adjustment added without one.
 *
 * 「混排 且沒有給時間」 — the model returned adds carrying no `toTime`, so they
 * were written with an empty time and fell into 「尚未安排時間」, which is where a
 * suggestion goes to be forgotten. The prompt does ask for a time; asking
 * harder is not a fix, and a start time is arithmetic.
 *
 * Only the ids given are touched. 「尚未安排時間」 is a legitimate place for an
 * item the traveller deliberately left untimed, and rewriting those would be
 * answering a question nobody asked.
 *
 * Each one starts where its day currently ends, in the order it arrived, and
 * `separateOverlaps` then settles anything that still clashes.
 */
export const timeTheUntimed = (
  items: ItineraryItem[],
  addedIds: Set<string>,
  dayStart = '10:00',
): { items: ItineraryItem[]; timedCount: number } => {
  const endOfDay = new Map<string, number>();
  items.forEach(item => {
    if (!item.date || !isTimedItem(item)) return;
    const start = timeToMinutes(item.time);
    if (start === undefined) return;
    endOfDay.set(item.date, Math.max(endOfDay.get(item.date) ?? 0, start + durationOf(item)));
  });

  const fallback = timeToMinutes(dayStart) ?? 600;
  /*
    An empty day still cannot begin before the traveller is in the country.
    See `notBeforeTheFloor`.
  */
  const floors = earliestFreeStartByDate(fixedAnchorSchedule(items));
  let timedCount = 0;
  const next = items.map(item => {
    if (!addedIds.has(item.id) || isTimedItem(item) || !item.date) return item;
    const floor = timeToMinutes(floors[item.date] || '');
    const opens = floor !== undefined && floor > fallback ? floor : fallback;
    const start = endOfDay.get(item.date) ?? opens;
    // Past midnight there is no honest time to give it; it keeps the bucket.
    if (start + durationOf(item) >= 24 * 60) return item;
    endOfDay.set(item.date, start + durationOf(item));
    timedCount += 1;
    return { ...item, time: minutesToTime(start) };
  });

  return timedCount === 0 ? { items, timedCount: 0 } : { items: next, timedCount };
};

/**
 * Nothing this adjustment added may happen before the day is open.
 *
 * 「到底航班起飛都還沒抵達為何會放逛美術館」 — asked twice, because the first fix
 * reached one of the two paths that place things. 優化動線 now asks what bounds
 * a day; the AI adjustment did not, so a model that answered 「10:00」 on a day
 * whose flight lands at 11:00 was taken at its word, and an addition with no
 * time at all was laid from the same constant.
 *
 * `earliestFreeStartByDate` has known the answer all evening — it is the floor
 * the day template and the AI planner are both held to, and it accounts for the
 * landing, the time out of the airport and check-in.
 *
 * Only this adjustment's own additions are moved. An item already on the plan
 * before the floor is the traveller's own, and may well be right: they know
 * what they booked.
 */
export const notBeforeTheFloor = (
  items: ItineraryItem[],
  addedIds: Set<string>,
): { items: ItineraryItem[]; movedCount: number } => {
  if (addedIds.size === 0) return { items, movedCount: 0 };
  const floors = earliestFreeStartByDate(fixedAnchorSchedule(items));

  let movedCount = 0;
  const next = items.map(item => {
    if (!addedIds.has(item.id) || !item.date) return item;
    const floor = floors[item.date];
    if (!floor) return item;
    const start = timeToMinutes(item.time);
    const floorMinutes = timeToMinutes(floor);
    if (floorMinutes === undefined) return item;
    // An addition with no time yet is left to `timeTheUntimed`, which starts
    // from the floor for the same reason.
    if (start === undefined || start >= floorMinutes) return item;
    movedCount += 1;
    return { ...item, time: floor };
  });

  return movedCount === 0 ? { items, movedCount: 0 } : { items: next, movedCount };
};

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
        /*
          Not past the end of the day, which is `LATEST_EXTENSION` and not
          midnight.

          This asked only whether the stop would finish before 00:00, so an
          overlap at seven in the evening could push a museum to 22:43 — late
          enough for the calendar above to warn 「排的時間可能超過打烊」, and
          nowhere near late enough to be refused. Judged on when it would
          *start*, because that is the part somebody has to be there for.
        */
        const pushed = freeFrom;
        if (pushed <= LATEST_START_MINUTES) {
          moved.set(item.id, minutesToTime(pushed));
          freeFrom = pushed + length;
          return;
        }
      }

      /*
        A fixed item cannot be pushed, so the flexible one before it is pulled
        back instead.

        「很不合理」 — 11:24 Reiyukai Shakaden Temple ran to 12:24 over a 12:00
        Alchemy that could not move. The loop only ever pushed the *later*
        item later, so when the later one was fixed it did nothing at all and
        the overlap simply stood. Being unable to move the second thing is not
        a reason to leave two things in one slot; it is a reason to move the
        first.

        Ends exactly where the fixed item begins — the least move that
        separates them — and only when that start is still a time the previous
        item could have begun at. A stop pulled back behind whatever came
        before it would trade this overlap for another one, which is why the
        day's own floor is carried forward as `settledTo`.
      */
      if (freeFrom !== undefined && start < freeFrom && isFixed(item)) {
        const before = ordered.filter(other =>
          other.id !== item.id && (timeToMinutes(moved.get(other.id) ?? other.time) ?? 0) < start);
        const clash = before[before.length - 1];
        /*
          How early the clash may go: the end of whatever is before *it*, not
          including itself. A first version measured against the running
          cursor, which already held the clash's own end, so the pull was
          always refused and the test caught it saying 11:24 unchanged.
        */
        const earlier = before[before.length - 2];
        const floor = earlier
          ? (timeToMinutes(moved.get(earlier.id) ?? earlier.time) ?? 0) + durationOf(earlier)
          : 0;
        if (clash && !isFixed(clash)) {
          const pulled = start - durationOf(clash);
          if (pulled >= floor) {
            moved.set(clash.id, minutesToTime(pulled));
            freeFrom = start;
          }
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
