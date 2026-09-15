import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import {
  detectCollisions,
  DRAG_STEP_PIXELS,
  rescheduleFromItem,
  stepsFromDragDistance,
  DEFAULT_DURATION_MINUTES,
  durationOf,
  findNearestFreeStart,
  minutesToTime,
  resequenceDayTimes,
  snapMinutes,
  timeToMinutes,
  wouldCollide,
} from './itineraryTimeline';

const DAY_6 = '2026-10-06';

const item = (overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem => ({
  time: '09:00',
  title: overrides.location || overrides.id,
  location: overrides.location || overrides.id,
  notes: '',
  type: 'ACTIVITY',
  date: DAY_6,
  ...overrides,
});

/** The Founder's Day 6 fixture, with durations. */
const day6 = (): ItineraryItem[] => [
  item({ id: 'it-baek', time: '11:00', durationMinutes: 120, location: '白淺灘文化村' }),
  item({ id: 'it-taejongdae', time: '14:00', durationMinutes: 120, location: '太宗臺遊園地' }),
  item({ id: 'it-park', time: '17:00', durationMinutes: 90, location: 'P.ARK' }),
];

const at = (items: ItineraryItem[], id: string) => items.find(entry => entry.id === id)!;

describe('time conversion and snapping', () => {
  it('round-trips a clock time through minutes', () => {
    expect(timeToMinutes('11:00')).toBe(660);
    expect(timeToMinutes('13:30')).toBe(810);
    expect(minutesToTime(660)).toBe('11:00');
    expect(minutesToTime(810)).toBe('13:30');
  });

  it('refuses a value that is not a clock time', () => {
    expect(timeToMinutes('')).toBeUndefined();
    expect(timeToMinutes('25:00')).toBeUndefined();
    expect(timeToMinutes('9:00')).toBeUndefined();
    expect(timeToMinutes('上午十一點')).toBeUndefined();
  });

  it('snaps to the half hour, never to an arbitrary minute', () => {
    expect(minutesToTime(snapMinutes(timeToMinutes('11:07')!))).toBe('11:00');
    expect(minutesToTime(snapMinutes(timeToMinutes('11:16')!))).toBe('11:30');
    expect(minutesToTime(snapMinutes(timeToMinutes('11:45')!))).toBe('12:00');
    expect(minutesToTime(snapMinutes(0))).toBe('00:00');
  });

  it('keeps a snapped value inside the day', () => {
    expect(snapMinutes(-90)).toBe(0);
    expect(snapMinutes(24 * 60 + 500)).toBeLessThan(24 * 60);
  });

  it('supports a finer interval without any other change', () => {
    expect(minutesToTime(snapMinutes(timeToMinutes('11:07')!, 15))).toBe('11:00');
    expect(minutesToTime(snapMinutes(timeToMinutes('11:23')!, 15))).toBe('11:30');
  });
});

describe('durationOf', () => {
  it('uses the item\'s own duration when it has one', () => {
    expect(durationOf({ durationMinutes: 120 })).toBe(120);
  });

  it('falls back to a default rather than zero', () => {
    expect(durationOf({})).toBe(DEFAULT_DURATION_MINUTES);
    expect(durationOf({ durationMinutes: 0 })).toBe(DEFAULT_DURATION_MINUTES);
    expect(durationOf({ durationMinutes: -30 })).toBe(DEFAULT_DURATION_MINUTES);
  });
});

describe('collision detection', () => {
  it('flags two activities whose spans overlap', () => {
    // A 11:00–13:00, B dropped at 12:00 — the ticket's example.
    const clashing = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '12:00', durationMinutes: 60 }),
    ];
    expect(detectCollisions(clashing).sort()).toEqual(['it-a', 'it-b']);
  });

  it('does not flag back-to-back activities', () => {
    const adjacent = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '13:00', durationMinutes: 60 }),
    ];
    expect(detectCollisions(adjacent)).toEqual([]);
  });

  it('ignores untimed items', () => {
    expect(detectCollisions([...day6(), item({ id: 'it-untimed', time: '' })])).toEqual([]);
  });

  it('answers whether a proposed span would clash', () => {
    expect(wouldCollide(day6(), 'it-park', timeToMinutes('13:30')!, 90)).toBe(true);
    expect(wouldCollide(day6(), 'it-park', timeToMinutes('16:00')!, 90)).toBe(false);
    // An item never collides with itself.
    expect(wouldCollide(day6(), 'it-baek', timeToMinutes('11:00')!, 120)).toBe(false);
  });

  it('re-runs against a changed duration', () => {
    // 14:00 for 60 min is clear; stretch to 120 and it reaches 16:00.
    const stretched = day6().map(entry => (entry.id === 'it-taejongdae' ? { ...entry, durationMinutes: 240 } : entry));
    expect(detectCollisions(stretched).sort()).toEqual(['it-park', 'it-taejongdae']);
  });
});

describe('findNearestFreeStart', () => {
  it('returns the requested time when it is free', () => {
    expect(findNearestFreeStart(day6(), 'it-park', timeToMinutes('16:00')!, 90)).toBe(timeToMinutes('16:00'));
  });

  it('finds the closest free slot when one exists', () => {
    // 太宗臺 14:00–16:00 only; 15:00 clashes, 16:00 is the nearest fit.
    const sparse = [item({ id: 'it-taejongdae', time: '14:00', durationMinutes: 120 })];
    const found = findNearestFreeStart(sparse, 'it-park', timeToMinutes('15:00')!, 90);
    expect(minutesToTime(found!)).toBe('16:00');
  });

  it('finds nothing when the day is genuinely full around the drop', () => {
    // The ticket's own fixture: 13:30 is boxed in by 白淺灘 (–13:00) and
    // 太宗臺 (14:00–16:00), and a 90-minute P.ARK does not fit either side.
    expect(findNearestFreeStart(day6(), 'it-park', timeToMinutes('13:30')!, 90)).toBeUndefined();
  });

  it('gives up rather than exiling the item across the day', () => {
    const packed = [
      item({ id: 'it-a', time: '09:00', durationMinutes: 600 }),
      item({ id: 'it-b', time: '19:00', durationMinutes: 300 }),
    ];
    expect(findNearestFreeStart(packed, 'it-c', timeToMinutes('12:00')!, 120)).toBeUndefined();
  });
});


describe('resequenceDayTimes — 「重新安排時間」', () => {
  it('rewrites times to follow the card order, keeping the day start', () => {
    // The user dragged P.ARK above 太宗臺, so the times read 11:00 / 17:00 / 14:00.
    const arranged = [
      item({ id: 'it-baek', time: '11:00', durationMinutes: 120, location: '白淺灘文化村' }),
      item({ id: 'it-park', time: '17:00', durationMinutes: 90, location: 'P.ARK' }),
      item({ id: 'it-taejongdae', time: '14:00', durationMinutes: 120, location: '太宗臺遊園地' }),
    ];
    const result = resequenceDayTimes(arranged);

    expect(result.changed).toBe(true);
    // Card order is the input and is never touched.
    expect(result.items.map(entry => entry.id)).toEqual(['it-baek', 'it-park', 'it-taejongdae']);
    // The day still starts where it started.
    expect(result.items[0].time).toBe('11:00');
    // And the times now read forwards.
    const times = result.items.map(entry => entry.time);
    expect([...times].sort()).toEqual(times);
  });

  it('respects the duration of each activity when spacing the next one', () => {
    // Out of order, so there is something to repair, and A runs three hours.
    const arranged = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 180 }),
      item({ id: 'it-b', time: '09:00', durationMinutes: 60 }),
    ];
    const result = resequenceDayTimes(arranged);
    expect(result.changed).toBe(true);
    expect(result.items[0].time).toBe('11:00');
    // Three hours at A means B cannot start before 14:00.
    expect(result.items[1].time >= '14:00').toBe(true);
  });

  it('leaves an already-chronological day alone', () => {
    const ordered = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 60 }),
      item({ id: 'it-b', time: '14:00', durationMinutes: 60 }),
    ];
    const result = resequenceDayTimes(ordered);
    expect(result.changed).toBe(false);
    expect(result.items).toEqual(ordered);
  });

  it('does nothing for a day with fewer than two timed items', () => {
    expect(resequenceDayTimes([]).changed).toBe(false);
    expect(resequenceDayTimes([item({ id: 'it-a', time: '11:00' })]).changed).toBe(false);
  });

  it('never invents a time for an untimed item', () => {
    const mixed = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 60 }),
      item({ id: 'it-b', time: '09:00', durationMinutes: 60 }),
      item({ id: 'it-untimed', time: '', location: '待定' }),
    ];
    const result = resequenceDayTimes(mixed);
    expect(result.items.find(entry => entry.id === 'it-untimed')?.time).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * Drag to reschedule, cascading the rest of the day
 * ------------------------------------------------------------------ */

describe('stepsFromDragDistance', () => {
  it('turns drag distance into discrete 30-minute steps', () => {
    expect(stepsFromDragDistance(0)).toBe(0);
    expect(stepsFromDragDistance(DRAG_STEP_PIXELS)).toBe(1);
    expect(stepsFromDragDistance(DRAG_STEP_PIXELS * 2)).toBe(2);
    expect(stepsFromDragDistance(-DRAG_STEP_PIXELS * 2)).toBe(-2);
  });

  it('ignores a nudge too small to be a deliberate step', () => {
    expect(stepsFromDragDistance(DRAG_STEP_PIXELS * 0.4)).toBe(0);
  });
});

describe('rescheduleFromItem — the §12 fixture', () => {
  /** 11:00 SPA LAND (180) · 14:30 新世界百貨 (120) · 17:00 Place C (90) */
  const fixture = (): ItineraryItem[] => [
    item({ id: 'it-spa', time: '11:00', durationMinutes: 180, location: 'SPA LAND' }),
    item({ id: 'it-dept', time: '14:30', durationMinutes: 120, location: '新世界百貨' }),
    item({ id: 'it-c', time: '17:00', durationMinutes: 90, location: 'Place C' }),
  ];
  const timesOf = (items: ItineraryItem[]) => items.map(entry => entry.time);

  it('moves SPA LAND earlier and carries the day with it, gaps intact', () => {
    const result = rescheduleFromItem(fixture(), 'it-spa', timeToMinutes('10:00')!);

    expect(result.changed).toBe(true);
    expect(result.startTime).toBe('10:00');
    // The 30-minute gap after SPA LAND and the 30-minute gap after 新世界百貨 both
    // survive: everything simply moves an hour earlier.
    expect(timesOf(result.items)).toEqual(['10:00', '13:30', '16:00']);
  });

  it('moves SPA LAND later and pushes the day back without overlapping', () => {
    const result = rescheduleFromItem(fixture(), 'it-spa', timeToMinutes('12:00')!);
    expect(timesOf(result.items)).toEqual(['12:00', '15:30', '18:00']);
    expect(detectCollisions(result.items)).toEqual([]);
  });

  it('keeps the day chronological whichever way it moves', () => {
    ['08:00', '10:00', '12:00', '15:00'].forEach(target => {
      const times = timesOf(rescheduleFromItem(fixture(), 'it-spa', timeToMinutes(target)!).items);
      expect([...times].sort()).toEqual(times);
    });
  });

  it('changes nothing but the times', () => {
    const before = fixture();
    const after = rescheduleFromItem(before, 'it-spa', timeToMinutes('10:00')!).items;
    after.forEach((entry, index) => {
      expect(entry.id).toBe(before[index].id);
      expect(entry.durationMinutes).toBe(before[index].durationMinutes);
      expect(entry.location).toBe(before[index].location);
    });
  });
});

describe('rescheduleFromItem — only what follows', () => {
  /** The §5 fixture. */
  const fixture = (): ItineraryItem[] => [
    item({ id: 'it-a', time: '09:00', durationMinutes: 60 }),
    item({ id: 'it-b', time: '11:00', durationMinutes: 60 }),
    item({ id: 'it-c', time: '14:00', durationMinutes: 60 }),
    item({ id: 'it-d', time: '17:00', durationMinutes: 60 }),
  ];

  it('leaves earlier items completely untouched', () => {
    const before = fixture();
    const result = rescheduleFromItem(before, 'it-b', timeToMinutes('12:00')!);
    expect(result.items[0]).toEqual(before[0]);
    expect(result.items.map(entry => entry.time)).toEqual(['09:00', '12:00', '15:00', '18:00']);
  });

  it('moves nothing when the last item is the one dragged', () => {
    const result = rescheduleFromItem(fixture(), 'it-d', timeToMinutes('18:30')!);
    expect(result.items.map(entry => entry.time)).toEqual(['09:00', '11:00', '14:00', '18:30']);
  });

  it('does nothing for an unknown or untimed item', () => {
    expect(rescheduleFromItem(fixture(), 'nope', 600).changed).toBe(false);
    const withUntimed = [...fixture(), item({ id: 'it-untimed', time: '' })];
    expect(rescheduleFromItem(withUntimed, 'it-untimed', 600).changed).toBe(false);
  });

  it('never gives an untimed item a time while cascading', () => {
    const withUntimed = [...fixture(), item({ id: 'it-untimed', time: '', location: '待定' })];
    const result = rescheduleFromItem(withUntimed, 'it-a', timeToMinutes('08:00')!);
    expect(result.items.find(entry => entry.id === 'it-untimed')?.time).toBe('');
  });
});

describe('rescheduleFromItem — gaps, overlaps and durations', () => {
  it('preserves a deliberate long gap rather than collapsing it', () => {
    // §7: A ends 13:00, B starts 14:30 — a 90-minute gap the user chose.
    const spaced = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '14:30', durationMinutes: 60 }),
    ];
    const result = rescheduleFromItem(spaced, 'it-a', timeToMinutes('10:00')!);
    // A now ends 12:00, so B lands at 13:30 — the 90 minutes are still there.
    expect(result.items.map(entry => entry.time)).toEqual(['10:00', '13:30']);
  });

  it('preserves a back-to-back pairing exactly', () => {
    const backToBack = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 60 }),
      item({ id: 'it-b', time: '12:00', durationMinutes: 60 }),
    ];
    const result = rescheduleFromItem(backToBack, 'it-a', timeToMinutes('10:00')!);
    expect(result.items.map(entry => entry.time)).toEqual(['10:00', '11:00']);
  });

  it('opens an overlap that already existed instead of reproducing it', () => {
    const overlapping = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '12:00', durationMinutes: 60 }),
    ];
    const result = rescheduleFromItem(overlapping, 'it-a', timeToMinutes('10:00')!);
    expect(detectCollisions(result.items)).toEqual([]);
    // A ends 12:00, so B starts after a small transit buffer.
    expect(result.items[1].time).toBe('12:15');
  });

  it('treats a missing duration as contributing nothing, not as an invented hour', () => {
    // §8: no duration on A must not shove B an hour later on no evidence.
    const noDuration = [
      item({ id: 'it-a', time: '11:00' }),
      item({ id: 'it-b', time: '13:00', durationMinutes: 60 }),
    ];
    const result = rescheduleFromItem(noDuration, 'it-a', timeToMinutes('12:00')!);
    // The two-hour gap the user had is preserved as-is.
    expect(result.items.map(entry => entry.time)).toEqual(['12:00', '14:00']);
  });

  it('drops a hand-made arrangement, since the result is chronological anyway', () => {
    const arranged = [
      { ...item({ id: 'it-a', time: '11:00', durationMinutes: 60 }), sortOrder: 0 },
      { ...item({ id: 'it-b', time: '14:00', durationMinutes: 60 }), sortOrder: 1 },
    ];
    const result = rescheduleFromItem(arranged, 'it-a', timeToMinutes('10:00')!);
    expect(result.items.every(entry => entry.sortOrder === undefined)).toBe(true);
  });
});

describe('rescheduleFromItem — day boundary', () => {
  it('flags a day pushed past the end-of-day boundary', () => {
    const late = [
      item({ id: 'it-a', time: '18:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '21:00', durationMinutes: 60 }),
    ];
    const result = rescheduleFromItem(late, 'it-a', timeToMinutes('20:00')!);
    expect(result.pushedLate).toBe(true);
    // It is still applied — the user is told, not overruled.
    expect(result.items[0].time).toBe('20:00');
  });

  it('does not flag an ordinary daytime schedule', () => {
    const ordinary = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 60 }),
      item({ id: 'it-b', time: '14:00', durationMinutes: 60 }),
    ];
    expect(rescheduleFromItem(ordinary, 'it-a', timeToMinutes('10:00')!).pushedLate).toBe(false);
  });

  it('never rolls an activity past midnight into the next day', () => {
    const late = [item({ id: 'it-a', time: '20:00', durationMinutes: 60 })];
    const result = rescheduleFromItem(late, 'it-a', 25 * 60);
    expect(result.items[0].time < '24:00').toBe(true);
    expect(result.items[0].date).toBe(DAY_6);
  });
});
