import { describe, expect, it } from 'vitest';
import { LATEST_EXTENSION } from './dayTemplate';
import { separateOverlaps } from './separateOverlaps';
import { optimiseTripRoute } from './optimiseTripRoute';
import { ItineraryItem } from '../types';

/**
 * 「排的時間可能超過打烊」, on a shop at 22:43.
 *
 * Nobody put it there. The planner below only writes whole and half hours;
 * `:43` comes from a cursor that accumulates transit minutes — and both of the
 * modules that move one were bounded by midnight, while `dayTemplate`, the
 * grid the traveller actually reads, has said 21:00 （extendable to 23:00）
 * all along. Two modules, two answers to 「幾點算今天結束」, and the one nobody
 * looks at is the one that writes the times.
 */
const DATE = '2026-10-22';
const LATEST = Number(LATEST_EXTENSION.slice(0, 2)) * 60 + Number(LATEST_EXTENSION.slice(3));

const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

const stop = (id: string, time: string, minutes: number, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, date: DATE, time, durationMinutes: minutes,
  title: id, location: id, notes: '', type: 'ACTIVITY',
  ...over,
} as ItineraryItem);

describe('separateOverlaps', () => {
  /*
    Three long stops stacked on one evening. Pushing them apart used to be
    allowed all the way to 23:59, so the last one landed after every shop in
    the city had shut.
  */
  it('will not push a stop past the end of the day', () => {
    const evening = [
      stop('a', '19:00', 180),
      stop('b', '19:30', 180),
      stop('c', '20:00', 180),
    ];

    separateOverlaps(evening).items.forEach(item => {
      expect(minutesOf(item.time)).toBeLessThanOrEqual(LATEST);
    });
  });

  /* The overlap stays rather than being hidden in the small hours. */
  it('leaves the clash where somebody can see it', () => {
    const evening = [stop('a', '21:00', 180), stop('b', '21:30', 120)];

    const after = separateOverlaps(evening).items;
    expect(after.find(item => item.id === 'b')?.time).toBe('21:30');
  });

  it('still separates an ordinary afternoon', () => {
    const afternoon = [stop('a', '13:00', 90), stop('b', '13:30', 60)];

    expect(separateOverlaps(afternoon).items.find(item => item.id === 'b')?.time).toBe('14:30');
  });
});

describe('optimiseTripRoute', () => {
  const far = (id: string, time: string, latitude: number) => stop(id, time, 120, {
    latitude, longitude: 139.7,
  });

  /*
    Enough stops that the running cursor would have reached the small hours.
    What does not fit is reported rather than written at a time nobody will
    keep.
  */
  it('never schedules a stop after the end of the day', () => {
    const crowded = [
      far('a', '10:00', 35.6),
      far('b', '12:00', 35.8),
      far('c', '14:00', 35.4),
      far('d', '16:00', 35.9),
      far('e', '18:00', 35.3),
      far('f', '20:00', 36.0),
    ];

    const plan = optimiseTripRoute(crowded, { country: '日本' });

    plan.days.flatMap(day => day.items).forEach(item => {
      expect(minutesOf(item.time)).toBeLessThanOrEqual(LATEST);
    });
  });

  it('says which stops it could not fit', () => {
    const crowded = Array.from({ length: 8 }, (_, index) =>
      far(`s${index}`, `${String(10 + index).padStart(2, '0')}:00`, 35.5 + index * 0.1));

    const plan = optimiseTripRoute(crowded, { country: '日本' });
    const kept = plan.days.flatMap(day => day.items).length;

    expect(kept + plan.unplaced.length).toBe(crowded.length);
  });
});
