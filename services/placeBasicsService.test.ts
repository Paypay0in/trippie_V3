import { describe, expect, it } from 'vitest';
import { hoursForDate, outsideOpeningHours, readsAsClosed } from './placeBasicsService';

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

/**
 * 「因此要提醒用戶」.
 *
 * Printing the hours puts the fact on the card and still leaves the traveller
 * comparing two clocks, on every card, for every day.
 */
describe('outsideOpeningHours', () => {
  const tuesday = 'Tuesday: 10:00 – 18:00';

  it('says nothing about a stop inside the window', () => {
    expect(outsideOpeningHours(tuesday, '14:00', 120)).toBeUndefined();
  });

  it('catches a stop that starts too early', () => {
    expect(outsideOpeningHours(tuesday, '09:00', 60)).toBe('before-opening');
  });

  it('catches a stop that starts after closing', () => {
    expect(outsideOpeningHours(tuesday, '19:00', 60)).toBe('after-closing');
  });

  /* 17:00 for two hours is inside the door and outside by the end of it. */
  it('catches a stop that would still be running at closing', () => {
    expect(outsideOpeningHours(tuesday, '17:00', 120)).toBe('after-closing');
  });

  it('reports a closed day as its own thing', () => {
    expect(outsideOpeningHours('Monday: Closed', '14:00', 60)).toBe('closed-day');
  });

  /*
    Only what it is sure of. A split shift has four times and is not one
    window; reading the first and last would report 15:00 as open at a
    restaurant that shuts between lunch and dinner.
  */
  it('stays quiet on a line it cannot read confidently', () => {
    expect(outsideOpeningHours('Tuesday: 11:30 – 14:00, 17:00 – 22:00', '15:00', 60)).toBeUndefined();
    expect(outsideOpeningHours('Tuesday: Open 24 hours', '03:00', 60)).toBeUndefined();
    expect(outsideOpeningHours(undefined, '03:00', 60)).toBeUndefined();
    expect(outsideOpeningHours(tuesday, undefined, 60)).toBeUndefined();
  });

  /* A bar open until 02:00 is a real window this cannot compare; left alone. */
  it('stays quiet on a window that runs past midnight', () => {
    expect(outsideOpeningHours('Friday: 18:00 – 02:00', '23:00', 60)).toBeUndefined();
  });

  it('reads a 12-hour clock', () => {
    expect(outsideOpeningHours('Tuesday: 10:00 AM – 6:00 PM', '19:00', 60)).toBe('after-closing');
    expect(outsideOpeningHours('Tuesday: 10:00 AM – 6:00 PM', '14:00', 60)).toBeUndefined();
  });
});
