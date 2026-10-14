/**
 * Measured against the live route: asked to fix a Tokyo day that zigzagged, the
 * model returned 「move KITTE丸之內 → 14:30」 and 「move 豪德寺 → 12:00」. The order
 * was right — it swapped the two stops that crossed the city — but 代官山 was
 * already at 14:30, so applying it put two places in one slot.
 */
import { describe, expect, it } from 'vitest';
import { separateOverlaps, timeTheUntimed } from './separateOverlaps';
import { applyItineraryAdjustment } from './itineraryAdjustment';
import { ItineraryItem } from '../types';

const item = (id: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY',
  date: '2026-10-22', time, durationMinutes: 120, ...over,
} as ItineraryItem);

describe('一個時段只能有一件事', () => {
  /* The measured case, exactly. */
  it('把撞在一起的往後推到前一個結束的時間', () => {
    const { items, movedCount } = separateOverlaps([
      item('shinjuku', '10:00'),
      item('gotokuji', '12:00', { durationMinutes: 90 }),
      item('daikanyama', '14:30'),
      item('kitte', '14:30', { durationMinutes: 90 }),
    ]);

    const at = (id: string) => items.find(entry => entry.id === id)?.time;
    expect(at('daikanyama')).toBe('14:30');
    expect(at('kitte')).toBe('16:30');
    expect(movedCount).toBe(1);
  });

  it('沒有重疊就一個都不動', () => {
    const day = [item('a', '10:00'), item('b', '12:00'), item('c', '14:00')];

    expect(separateOverlaps(day).movedCount).toBe(0);
    expect(separateOverlaps(day).items).toBe(day);
  });

  /* 「航班時間是固定的行程」. */
  it('航班不會被移動，被移的是另一個', () => {
    const { items } = separateOverlaps([
      item('flight', '14:00', { type: 'FLIGHT', durationMinutes: 120 }),
      item('cafe', '14:00'),
    ]);

    expect(items.find(entry => entry.id === 'flight')?.time).toBe('14:00');
    expect(items.find(entry => entry.id === 'cafe')?.time).toBe('16:00');
  });

  it('使用者自己釘住的也不動', () => {
    const { items } = separateOverlaps([
      item('pinned', '14:00', { isPinned: true }),
      item('other', '14:30'),
    ]);

    expect(items.find(entry => entry.id === 'pinned')?.time).toBe('14:00');
    expect(items.find(entry => entry.id === 'other')?.time).toBe('16:00');
  });

  /* Each day is its own; an overlap cannot exist across two dates. */
  it('不同天的同一個時間不算重疊', () => {
    expect(separateOverlaps([
      item('a', '10:00'),
      item('b', '10:00', { date: '2026-10-23' }),
    ]).movedCount).toBe(0);
  });

  /*
    Wrapping an evening into the small hours is worse than an overlap the
    traveller can see and fix.
  */
  it('推過午夜就不推', () => {
    expect(separateOverlaps([
      item('a', '22:00', { durationMinutes: 120 }),
      item('b', '22:30', { durationMinutes: 120 }),
    ]).movedCount).toBe(0);
  });

  /* A chain: each push is measured from where the previous one ended. */
  it('連續三個撞在一起會依序排開', () => {
    const { items } = separateOverlaps([
      item('a', '10:00', { durationMinutes: 60 }),
      item('b', '10:00', { durationMinutes: 60 }),
      item('c', '10:00', { durationMinutes: 60 }),
    ]);

    expect(items.map(entry => entry.time).sort()).toEqual(['10:00', '11:00', '12:00']);
  });
});

/**
 * Through the real path, not the helper: the repair lives at the one exit every
 * apply goes through, and the bug this fixes was precisely a step that only
 * existed in one of several callers.
 */
describe('套用 AI 調整之後，沒有兩件事同時發生', () => {
  it('模型把兩個項目排到同一個時間時，套用後會分開', () => {
    const existing = [
      item('it-1', '10:00', { title: '新宿御苑' }),
      item('it-2', '12:00', { title: 'KITTE丸之內', durationMinutes: 90 }),
      item('it-3', '13:30', { title: '豪德寺', durationMinutes: 90 }),
      item('it-4', '14:30', { title: '代官山 蔦屋書店' }),
    ];

    // The changes the live model actually returned for this day.
    const { items } = applyItineraryAdjustment(
      existing,
      {
        mode: 'reorder',
        summary: '',
        warnings: [],
        changes: [
          { type: 'move', existingItemId: 'it-2', toTime: '14:30' },
          { type: 'move', existingItemId: 'it-3', toTime: '12:00' },
        ],
      } as never,
      () => 'new-id',
    );

    const times = items.map(entry => entry.time).sort();
    expect(new Set(times).size).toBe(times.length);
  });
});

/**
 * 「混排 且沒有給時間」.
 *
 * The model returned adds carrying no `toTime`, so they were written with an
 * empty time and fell into 「尚未安排時間」 — where a suggestion goes to be
 * forgotten. The prompt does ask for a time; asking harder is not a fix.
 */
describe('AI 加進來卻沒給時間的行程', () => {
  it('接在那天最後一個行程之後', () => {
    const { items, timedCount } = timeTheUntimed([
      item('existing', '10:00', { durationMinutes: 120 }),
      item('added', '', { durationMinutes: 60 }),
    ], new Set(['added']));

    expect(items.find(entry => entry.id === 'added')?.time).toBe('12:00');
    expect(timedCount).toBe(1);
  });

  it('那天還沒有任何行程時，從預設的出發時間開始', () => {
    const { items } = timeTheUntimed([item('added', '')], new Set(['added']));

    expect(items.find(entry => entry.id === 'added')?.time).toBe('10:00');
  });

  it('兩筆一起加進來時依序接著排', () => {
    const { items } = timeTheUntimed([
      item('a', '', { durationMinutes: 60 }),
      item('b', '', { durationMinutes: 60 }),
    ], new Set(['a', 'b']));

    expect(items.map(entry => entry.time)).toEqual(['10:00', '11:00']);
  });

  /*
    「尚未安排時間」 is a legitimate place for an item the traveller left untimed;
    rewriting those would answer a question nobody asked.
  */
  it('不碰使用者自己留空的', () => {
    const { items, timedCount } = timeTheUntimed([
      item('mine', ''),
      item('added', ''),
    ], new Set(['added']));

    expect(items.find(entry => entry.id === 'mine')?.time).toBe('');
    expect(timedCount).toBe(1);
  });

  /* Past midnight there is no honest time to give it. */
  it('那天已經排到太晚就留在未安排', () => {
    const { timedCount } = timeTheUntimed([
      item('late', '22:00', { durationMinutes: 120 }),
      item('added', '', { durationMinutes: 120 }),
    ], new Set(['added']));

    expect(timedCount).toBe(0);
  });
});
