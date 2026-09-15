import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import {
  hasTimeOrderConflict,
  itemsForDay,
  moveItemToDay,
  orderItemsForDay,
  reorderWithinDay,
  timeConflictItemIds,
} from './itineraryOrdering';

const DAY_5 = '2026-10-05';
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

/** The Founder's Day 6 fixture. */
const day6 = (): ItineraryItem[] => [
  item({ id: 'it-baek', time: '11:00', location: '白淺灘文化村' }),
  item({ id: 'it-taejongdae', time: '14:00', location: '太宗臺遊園地' }),
  item({ id: 'it-park', time: '17:00', location: 'P.ARK' }),
];

const names = (items: ItineraryItem[]) => items.map(entry => entry.location);
const ids = (items: ItineraryItem[]) => items.map(entry => entry.id);

describe('orderItemsForDay', () => {
  it('sorts chronologically while no day has been arranged by hand', () => {
    const shuffled = [day6()[2], day6()[0], day6()[1]];
    expect(names(orderItemsForDay(shuffled))).toEqual(['白淺灘文化村', '太宗臺遊園地', 'P.ARK']);
    // Nothing gained a sortOrder just by being rendered.
    expect(shuffled.every(entry => entry.sortOrder === undefined)).toBe(true);
  });

  it('honours the arrangement the user made over the clock', () => {
    // The list is a journey order, not a calendar, so a 17:00 card may sit above
    // a 14:00 one. The UI warns about it rather than re-sorting behind them.
    const arranged = [
      { ...day6()[0], sortOrder: 0 },
      { ...day6()[1], sortOrder: 2 },
      { ...day6()[2], sortOrder: 1 },
    ];
    expect(names(orderItemsForDay(arranged))).toEqual(['白淺灘文化村', 'P.ARK', '太宗臺遊園地']);
  });

  it('places a newly added item after an arranged day rather than into the middle', () => {
    const arranged = [
      { ...day6()[0], sortOrder: 0 },
      { ...day6()[2], sortOrder: 1 },
      item({ id: 'it-new', time: '08:00', location: '早餐' }),
    ];
    expect(names(orderItemsForDay(arranged))).toEqual(['白淺灘文化村', 'P.ARK', '早餐']);
  });

  it('puts untimed items last in a day nobody has arranged', () => {
    const mixed = [item({ id: 'it-untimed', time: '', location: '待定' }), day6()[0]];
    expect(ids(orderItemsForDay(mixed))).toEqual(['it-baek', 'it-untimed']);
  });
});

/**
 * Reordering by index now serves the 尚未安排時間 section only. Timed items are
 * moved by dragging them to a time on the axis (see itineraryTimeline).
 */
describe('reorderWithinDay — untimed items', () => {
  const untimedDay = (): ItineraryItem[] => [
    item({ id: 'it-x', time: '', location: '待定 X' }),
    item({ id: 'it-y', time: '', location: '待定 Y' }),
    item({ id: 'it-z', time: '', location: '待定 Z' }),
  ];

  it('moves an untimed item to a new position and keeps it', () => {
    const result = reorderWithinDay(untimedDay(), 'it-z', 0);
    expect(result.changed).toBe(true);
    const ordered = orderItemsForDay(itemsForDay(result.items, DAY_6));
    expect(names(ordered)).toEqual(['待定 Z', '待定 X', '待定 Y']);
    expect(ordered.map(entry => entry.sortOrder)).toEqual([0, 1, 2]);
  });

  it('does not invent a time for an item it moves', () => {
    const result = reorderWithinDay(untimedDay(), 'it-z', 0);
    expect(result.items.every(entry => entry.time === '')).toBe(true);
  });

  it('reports no conflict for a chronological timed day', () => {
    expect(hasTimeOrderConflict(orderItemsForDay(itemsForDay(day6(), DAY_6)))).toBe(false);
  });

  it('still reports a sequence that disagrees with its own clock', () => {
    const outOfOrder = [day6()[0], day6()[2], day6()[1]];
    expect(hasTimeOrderConflict(outOfOrder)).toBe(true);
    expect(timeConflictItemIds(outOfOrder).sort()).toEqual(['it-park', 'it-taejongdae'].sort());
  });
});

describe('reorderWithinDay — safety', () => {
  it('addresses items by id, never by name', () => {
    // Two cards sharing a display name; only the dragged id moves.
    const duplicates = [
      item({ id: 'it-a', time: '', location: '國際市場' }),
      item({ id: 'it-b', time: '', location: '國際市場' }),
      item({ id: 'it-c', time: '', location: '南浦洞' }),
    ];
    const result = reorderWithinDay(duplicates, 'it-b', 0);
    expect(ids(orderItemsForDay(itemsForDay(result.items, DAY_6)))).toEqual(['it-b', 'it-a', 'it-c']);
  });

  it('does nothing for an unknown id', () => {
    const result = reorderWithinDay(day6(), 'it-does-not-exist', 0);
    expect(result.changed).toBe(false);
    expect(result.items).toEqual(day6());
  });

  it('treats a drop onto its own position as no change', () => {
    const untimed = [item({ id: 'it-x', time: '' }), item({ id: 'it-y', time: '' })];
    expect(reorderWithinDay(untimed, 'it-y', 1).changed).toBe(false);
  });

  it('clamps a drop past the end instead of losing the item', () => {
    const untimed = [item({ id: 'it-x', time: '' }), item({ id: 'it-y', time: '' })];
    const result = reorderWithinDay(untimed, 'it-x', 99);
    expect(ids(orderItemsForDay(itemsForDay(result.items, DAY_6)))).toEqual(['it-y', 'it-x']);
    expect(result.items).toHaveLength(2);
  });

  it('never duplicates or drops an item', () => {
    const untimed = [item({ id: 'it-x', time: '' }), item({ id: 'it-y', time: '' })];
    const result = reorderWithinDay(untimed, 'it-y', 0);
    expect(ids(result.items).sort()).toEqual(['it-x', 'it-y']);
  });

  it('leaves other days completely untouched', () => {
    const other = item({ id: 'it-day5', date: DAY_5, time: '', location: '甘川文化村' });
    const result = reorderWithinDay([item({ id: 'it-x', time: '' }), item({ id: 'it-y', time: '' }), other], 'it-y', 0);
    expect(result.items.find(entry => entry.id === 'it-day5')).toEqual(other);
  });

  it('can arrange a day of untimed items', () => {
    const untimed = [
      item({ id: 'it-x', time: '', location: 'X' }),
      item({ id: 'it-y', time: '', location: 'Y' }),
    ];
    const result = reorderWithinDay(untimed, 'it-y', 0);
    expect(ids(orderItemsForDay(itemsForDay(result.items, DAY_6)))).toEqual(['it-y', 'it-x']);
    // Moving an untimed item does not invent a time for it.
    expect(result.items.every(entry => entry.time === '')).toBe(true);
  });
});

describe('moveItemToDay — the cross-day fixture', () => {
  const withDay5 = (): ItineraryItem[] => [
    item({ id: 'it-day5', date: DAY_5, time: '10:00', location: '甘川文化村' }),
    ...day6(),
  ];

  it('drags 太宗臺 from Day 6 to Day 5 without duplicating it', () => {
    const result = moveItemToDay(withDay5(), 'it-taejongdae', DAY_5);
    expect(result.changed).toBe(true);

    // Exactly one copy exists, and it now belongs to Day 5.
    expect(result.items.filter(entry => entry.id === 'it-taejongdae')).toHaveLength(1);
    expect(result.items.find(entry => entry.id === 'it-taejongdae')?.date).toBe(DAY_5);
    expect(ids(itemsForDay(result.items, DAY_6))).toEqual(['it-baek', 'it-park']);
    expect(ids(orderItemsForDay(itemsForDay(result.items, DAY_5)))).toEqual(['it-day5', 'it-taejongdae']);
    // Nothing was lost overall.
    expect(result.items).toHaveLength(4);
  });

  it('keeps the moved item\'s time and identity', () => {
    const before = withDay5().find(entry => entry.id === 'it-taejongdae')!;
    const after = moveItemToDay(withDay5(), 'it-taejongdae', DAY_5).items
      .find(entry => entry.id === 'it-taejongdae')!;
    expect(after).toMatchObject({
      id: before.id, time: before.time, title: before.title, location: before.location, type: before.type,
    });
    expect(after.date).toBe(DAY_5);
  });

  it('does nothing for an unknown id', () => {
    const result = moveItemToDay(withDay5(), 'nope', DAY_5);
    expect(result.changed).toBe(false);
    expect(result.items).toEqual(withDay5());
  });

  it('does not renumber a source day that was never arranged by hand', () => {
    const result = moveItemToDay(withDay5(), 'it-taejongdae', DAY_5);
    const remaining = itemsForDay(result.items, DAY_6);
    expect(remaining.every(entry => entry.sortOrder === undefined)).toBe(true);
  });
});

describe('hasTimeOrderConflict', () => {
  it('is false for a chronological day', () => {
    expect(hasTimeOrderConflict(day6())).toBe(false);
  });

  it('judges the sequence as given rather than re-sorting it', () => {
    // The whole point: an out-of-order arrangement must report a conflict even
    // when the items carry no sortOrder yet.
    const arranged = [day6()[0], day6()[2], day6()[1]];
    expect(hasTimeOrderConflict(arranged)).toBe(true);
    expect(timeConflictItemIds(arranged)).toEqual(['it-park', 'it-taejongdae']);
  });

  it('ignores untimed items rather than calling them conflicts', () => {
    const mixed = [
      { ...day6()[0], sortOrder: 0 },
      { ...item({ id: 'it-untimed', time: '', location: '待定' }), sortOrder: 1 },
      { ...day6()[2], sortOrder: 2 },
    ];
    expect(hasTimeOrderConflict(mixed)).toBe(false);
  });

  it('is false for a day with a single timed item', () => {
    expect(hasTimeOrderConflict([day6()[0]])).toBe(false);
    expect(hasTimeOrderConflict([])).toBe(false);
  });
});
