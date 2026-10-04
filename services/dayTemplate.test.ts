import { describe, expect, it } from 'vitest';
import { buildDaySlots, slotForTime } from './dayTemplate';
import { FixedScheduleEntry } from './itineraryDayFloor';

/**
 * 「目前行程表會一直跑版 … 一個行程都預設抓 2 小時 … 早餐、午餐、晚餐區塊也是兩小時」.
 *
 * The plan drifted because every item carried its own clock: one without a
 * duration was guessed at sixty minutes, the next overlapped it, and the whole
 * afternoon moved every time anything was added. Blocks invert that — the day's
 * shape is decided first, so adding a restaurant cannot move the museum.
 */

const DAY = '2026-10-05';

describe('buildDaySlots', () => {
  it('cuts the day into two-hour blocks from the time the traveller starts', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '16:00' });

    expect(slots.map(slot => `${slot.startTime}-${slot.endTime}`)).toEqual([
      '10:00-12:00', '12:00-14:00', '14:00-16:00',
    ]);
  });

  it('names a block by the clock, so a late start opens with lunch', () => {
    // Not by position in the day: a day that starts at 08:00 opens with
    // breakfast and one that starts at 12:00 opens with lunch, and neither
    // needs a special case.
    expect(buildDaySlots({ date: DAY, dayStart: '08:00', dayEnd: '10:00' })[0].label).toBe('早餐');
    expect(buildDaySlots({ date: DAY, dayStart: '12:00', dayEnd: '14:00' })[0].label).toBe('午餐');
  });

  it('marks meals as meals and the rest as activities', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '20:00' });

    expect(slots.map(slot => `${slot.label}:${slot.kind}`)).toEqual([
      '上午行程:activity',
      '午餐:meal',
      '下午行程:activity',
      // 16:00 is still the afternoon; the evening starts at 17:00.
      '下午行程:activity',
      '晚餐:meal',
    ]);
  });

  it('never offers a block that would run past the end of the day', () => {
    // A block with nowhere to finish is time nobody has.
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '15:00' });

    expect(slots[slots.length - 1].endTime).toBe('14:00');
  });
});

/**
 * 「航班時間是固定的行程，預留兩小時前到機場是必要固定的行程」.
 */
describe('a day with a flight in it', () => {
  const arrival: FixedScheduleEntry[] = [
    { date: DAY, time: '14:30', durationMinutes: 60, label: '航班抵達', role: 'landing' },
    { date: DAY, time: '16:00', durationMinutes: 60, label: '飯店入住', role: 'checkin' },
  ];
  const departure: FixedScheduleEntry[] = [
    { date: DAY, time: '13:00', durationMinutes: 120, label: '前往機場', role: 'to_airport' },
    { date: DAY, time: '15:00', durationMinutes: 150, label: '航班起飛', role: 'departure' },
  ];

  it('starts the arrival day after they are out of the airport and checked in', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', fixedSchedule: arrival });

    expect(slots[0].startTime >= '17:00').toBe(true);
  });

  it('ends the departure day before they have to leave for the airport', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '08:00', fixedSchedule: departure });

    expect(slots.every(slot => slot.endTime <= '13:00')).toBe(true);
  });

  it('offers nothing at all when the flights leave no room', () => {
    // A landing at 20:00 has no day to plan, and three slots after it would be
    // inventing time.
    const lateArrival: FixedScheduleEntry[] = [
      { date: DAY, time: '20:00', durationMinutes: 60, label: '航班抵達', role: 'landing' },
    ];

    expect(buildDaySlots({ date: DAY, fixedSchedule: lateArrival })).toEqual([]);
  });

  it('leaves an ordinary day alone', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '20:00', fixedSchedule: [] });

    expect(slots).toHaveLength(5);
  });
});

describe('slotForTime', () => {
  const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '16:00' });

  it('finds the block an item sits in', () => {
    expect(slotForTime(slots, '10:00')?.startTime).toBe('10:00');
    expect(slotForTime(slots, '13:30')?.startTime).toBe('12:00');
  });

  it('keeps an item nudged off the hour in its own block', () => {
    // A block that loses its occupant when somebody drags it fifteen minutes
    // is a block that offers to double-book the morning.
    expect(slotForTime(slots, '10:15')?.startTime).toBe('10:00');
  });

  it('is undefined outside the day, or with no time at all', () => {
    expect(slotForTime(slots, '08:00')).toBeUndefined();
    expect(slotForTime(slots, undefined)).toBeUndefined();
    expect(slotForTime(slots, 'nope')).toBeUndefined();
  });
});
