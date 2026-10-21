import { describe, expect, it } from 'vitest';
import { buildDayTemplate } from './dayTemplate';

/**
 * 「我在行程表下方改行程 上方的行程表不會同步」.
 *
 * The calendar showed 寶可夢中心晴空塔店 at 22:43 with an overlap warning; the
 * planner below showed a clean day ending at 20:15. They were not two renders
 * of one item — the grid stops at the day's end （21:00）, so a stop starting
 * after it was never visited, got no slot and no `occupantId`, and
 * `replaceInSlot` could not see it. Filling a row therefore added a *second*
 * copy of the place and left the first exactly where it was.
 */
const DATE = '2026-10-22';

const stop = (id: string, time: string, minutes = 60) => ({
  id, time, durationMinutes: minutes,
});

describe('a stop planned after the day ends', () => {
  it('still gets a row', () => {
    const { slots } = buildDayTemplate({
      date: DATE,
      occupants: [stop('late', '22:43')],
    });

    const row = slots.find(slot => slot.occupantId === 'late');
    expect(row).toMatchObject({ startTime: '22:43', endTime: '23:43', pastDayEnd: true });
  });

  /* Marked, or it reads as an evening block the day offered. */
  it('is not mistaken for an ordinary block', () => {
    const { slots } = buildDayTemplate({
      date: DATE,
      occupants: [stop('morning', '10:00', 120), stop('late', '22:43')],
    });

    expect(slots.find(slot => slot.occupantId === 'morning')?.pastDayEnd).toBeUndefined();
    expect(slots.find(slot => slot.occupantId === 'late')?.pastDayEnd).toBe(true);
  });

  /* Every stop, not just the first one past the edge. */
  it('lists all of them, in clock order', () => {
    const { slots } = buildDayTemplate({
      date: DATE,
      occupants: [stop('b', '23:10'), stop('a', '22:00')],
    });

    const late = slots.filter(slot => slot.pastDayEnd).map(slot => slot.occupantId);
    expect(late).toEqual(['a', 'b']);
  });

  /*
    An `occupantId` is what `replaceInSlot` deletes. Without one, filling a row
    adds a second copy of the place and leaves the first behind — which is the
    duplicate on the Founder's screen.
  */
  it('carries the id the planner needs to replace it', () => {
    const { slots } = buildDayTemplate({ date: DATE, occupants: [stop('late', '22:43')] });

    expect(slots.filter(slot => slot.occupantId === 'late')).toHaveLength(1);
  });

  /*
    「一直出現」 — a stop at exactly 21:00 fell out of the loop on its first
    turn, so it was listed as stranded *and* an empty 21:00–23:00 row was
    offered on top of it. Two rows for the same half of the evening.
  */
  it('does not offer an empty block over a stop that is already there', () => {
    const { slots } = buildDayTemplate({
      date: DATE,
      occupants: [stop('evening', '21:00', 60)],
    });

    const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
    const taken = slots.filter(slot => slot.occupantId);
    const empties = slots.filter(slot => !slot.occupantId);

    // An empty row offering time a stop is already standing in is the thing
    // that was on screen twice: 21:00–23:00 over a stop that began at 21:00.
    empties.forEach(empty => {
      taken.forEach(busy => {
        const clash = minutes(empty.startTime) < minutes(busy.endTime)
          && minutes(busy.startTime) < minutes(empty.endTime);
        expect(clash, `${empty.startTime}–${empty.endTime} overlaps ${busy.startTime}–${busy.endTime}`).toBe(false);
      });
    });
  });

  it('keeps the stops in clock order, late ones included', () => {
    const { slots } = buildDayTemplate({
      date: DATE,
      occupants: [stop('late', '22:00', 60), stop('noon', '12:00', 60)],
    });

    const occupied = slots.filter(slot => slot.occupantId).map(slot => slot.occupantId);
    expect(occupied).toEqual(['noon', 'late']);
  });

  it('changes nothing about a day that fits', () => {
    const { slots } = buildDayTemplate({
      date: DATE,
      occupants: [stop('a', '10:00', 120), stop('b', '14:00', 60)],
    });

    expect(slots.some(slot => slot.pastDayEnd)).toBe(false);
    expect(slots.filter(slot => slot.occupantId).map(slot => slot.occupantId)).toEqual(['a', 'b']);
  });
});
