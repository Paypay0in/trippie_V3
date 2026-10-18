import { describe, expect, it } from 'vitest';
import { hoursForDate, readsAsClosed } from './placeBasicsService';

/**
 * 「像這個開放時間也都要寫成行程表上」.
 *
 * Google returns the week Monday-first; a trip date is a plain YYYY-MM-DD.
 * 2026-10-26 is a Monday, which is exactly the day 東京都現代美術館 is shut.
 */
describe('hoursForDate', () => {
  const week = [
    'Monday: Closed',
    'Tuesday: 10:00 – 18:00',
    'Wednesday: 10:00 – 18:00',
    'Thursday: 10:00 – 18:00',
    'Friday: 10:00 – 18:00',
    'Saturday: 10:00 – 18:00',
    'Sunday: 10:00 – 18:00',
  ];
  const basics = { weekdayHours: week } as never;

  it('reads the day the stop is actually on', () => {
    expect(hoursForDate(basics, '2026-10-26')).toBe('Monday: Closed');
    expect(hoursForDate(basics, '2026-10-27')).toBe('Tuesday: 10:00 – 18:00');
  });

  /*
    A trip date is a date, not an instant. `new Date('2026-10-26')` is parsed
    as UTC and lands on the Sunday west of Greenwich.
  */
  it('does not slip a day on a western timezone', () => {
    expect(hoursForDate(basics, '2026-10-26')).not.toBe('Sunday: 10:00 – 18:00');
  });

  it('says nothing without a full week or a date', () => {
    expect(hoursForDate(basics, undefined)).toBeUndefined();
    expect(hoursForDate(basics, '26/10/2026')).toBeUndefined();
    expect(hoursForDate({ weekdayHours: ['Monday: Closed'] } as never, '2026-10-26')).toBeUndefined();
    expect(hoursForDate(null, '2026-10-26')).toBeUndefined();
  });
});

describe('readsAsClosed', () => {
  it('recognises the words Google returns', () => {
    expect(readsAsClosed('Monday: Closed')).toBe(true);
    expect(readsAsClosed('星期一: 休息')).toBe(true);
    expect(readsAsClosed('月曜日: 休館')).toBe(true);
  });

  /*
    Unrecognised reads as open. Printing 公休 over a day somebody could have
    visited is the more expensive mistake — they cancel rather than check.
  */
  it('treats anything it cannot read as open', () => {
    expect(readsAsClosed('Tuesday: 10:00 – 18:00')).toBe(false);
    expect(readsAsClosed(undefined)).toBe(false);
  });
});
