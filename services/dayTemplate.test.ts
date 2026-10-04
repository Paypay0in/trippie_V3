import { describe, expect, it } from 'vitest';
import { buildDaySlots, buildDayTemplate, slotForTime } from './dayTemplate';
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

/**
 * 「先 B 然後讓用戶可以自己調整停留時間，AI 也可以建議。後來的行程就都要自動提前或
 * 順延」.
 *
 * A block's length is an input and its start time is an output. That is what
 * keeps the day from drifting: the shift is deliberate and whole, rather than
 * each item guessing a clock and overlapping the next.
 */
describe('a block the traveller lengthened', () => {
  it('pushes everything after it later', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '20:00', durations: { 0: 180 } });

    expect(slots.map(slot => slot.startTime)).toEqual(['10:00', '13:00', '15:00', '17:00']);
  });

  it('pulls everything after it earlier when shortened', () => {
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '20:00', durations: { 0: 60 } });

    // 19:00 would run to 21:00, past the 20:00 end, so the day stops at 17:00.
    expect(slots.map(slot => slot.startTime)).toEqual(['10:00', '11:00', '13:00', '15:00', '17:00']);
  });

  it('keeps the length on the block it was set on, not on the clock', () => {
    // Keyed by position: a block keyed on 「14:00」 would change identity the
    // moment an earlier one was lengthened, and the length just set would
    // belong to a different block.
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '20:00', durations: { 0: 180, 1: 60 } });

    expect(slots[0].durationMinutes).toBe(180);
    expect(slots[1].durationMinutes).toBe(60);
    expect(slots[1].startTime).toBe('13:00');
  });

  it('lets the clock rename the blocks it moved', () => {
    // A morning that runs long turns the next block into lunch by itself.
    const slots = buildDaySlots({ date: DAY, dayStart: '10:00', dayEnd: '20:00', durations: { 0: 150 } });

    expect(slots[1].label).toBe('午餐');
  });

  it('says so when the lengthened block itself no longer fits', () => {
    // 「延長後排不進今天」 is worth saying out loud; quietly overrunning the time
    // they have to leave for the airport is the overlap this design ends.
    const template = buildDayTemplate({
      date: DAY, dayStart: '10:00', dayEnd: '16:00', durations: { 1: 300 },
    });

    expect(template.ranOutOfDay).toBe(true);
    expect(template.slots.map(slot => slot.startTime)).toEqual(['10:00']);
  });

  it('never runs a block past the time they leave for the airport', () => {
    const template = buildDayTemplate({
      date: DAY,
      dayStart: '10:00',
      fixedSchedule: [{ date: DAY, time: '16:00', durationMinutes: 120, label: '前往機場', role: 'to_airport' }],
      durations: { 0: 300 },
    });

    expect(template.slots.every(slot => slot.endTime <= '16:00')).toBe(true);
  });

  it('is not an overflow when the day simply ends', () => {
    expect(buildDayTemplate({ date: DAY, dayStart: '10:00', dayEnd: '20:00' }).ranOutOfDay).toBe(false);
  });
});
