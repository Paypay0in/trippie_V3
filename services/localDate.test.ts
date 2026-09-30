import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addLocalDays,
  enumerateLocalDates,
  fromLocalIsoDate,
  localToday,
  toLocalIsoDate,
} from './localDate';

/**
 * These run under the Founder's own timezone, UTC+8, because that is where the
 * bug was visible and where the old code failed. Running them under UTC would
 * pass against the broken implementation and prove nothing.
 */
const withTimezone = (tz: string, run: () => void) => {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    run();
  } finally {
    process.env.TZ = previous;
  }
};

describe('trip day tabs in a UTC+8 timezone (the reported bug)', () => {
  beforeEach(() => { process.env.TZ = 'Asia/Taipei'; });
  afterEach(() => { process.env.TZ = 'UTC'; });

  it('starts the Busan trip on the day it was entered, not the day before', () => {
    const dates = enumerateLocalDates('2026-10-02', '2026-10-07');
    // Day 1 read 10/01 on the Founder's screen while the trip said 10/02.
    expect(dates[0]).toBe('2026-10-02');
    expect(dates.at(-1)).toBe('2026-10-07');
    expect(dates).toHaveLength(6);
  });

  it('agrees with the server, which enumerates the same span in UTC', () => {
    // itineraryPlanningService parses with an explicit Z and was always right.
    // The two sides disagreeing is what put plan items on the wrong day.
    const server: string[] = [];
    for (let c = Date.parse('2026-10-02T00:00:00Z'); c <= Date.parse('2026-10-07T00:00:00Z'); c += 86_400_000) {
      server.push(new Date(c).toISOString().slice(0, 10));
    }
    expect(enumerateLocalDates('2026-10-02', '2026-10-07')).toEqual(server);
  });

  it('reads today as the local calendar day, not the UTC one', () => {
    // 07:00 in Taipei is still the previous day in UTC. An expense entered over
    // breakfast used to be filed under yesterday.
    expect(localToday(new Date('2026-10-03T07:00:00+08:00'))).toBe('2026-10-03');
    // And just before local midnight, which UTC has not reached yet.
    expect(localToday(new Date('2026-10-03T23:30:00+08:00'))).toBe('2026-10-03');
  });

  it('adds days without drifting', () => {
    expect(addLocalDays('2026-10-02', 1)).toBe('2026-10-03');
    expect(addLocalDays('2026-10-02', 0)).toBe('2026-10-02');
    expect(addLocalDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addLocalDays('2026-10-02', -1)).toBe('2026-10-01');
  });
});

describe('across timezones', () => {
  for (const tz of ['UTC', 'Asia/Taipei', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    it(`gives the entered start date back unchanged in ${tz}`, () => {
      withTimezone(tz, () => {
        expect(enumerateLocalDates('2026-10-02', '2026-10-07')[0]).toBe('2026-10-02');
        expect(toLocalIsoDate(fromLocalIsoDate('2026-10-02'))).toBe('2026-10-02');
      });
    });
  }
});

describe('daylight saving', () => {
  it('does not repeat or skip a day across a spring-forward boundary', () => {
    withTimezone('America/Los_Angeles', () => {
      // 2026-03-08 is when US clocks jump forward. Stepping by a fixed
      // 86,400,000ms lands on 23:00 the previous day and repeats the date.
      const dates = enumerateLocalDates('2026-03-07', '2026-03-10');
      expect(dates).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
    });
  });

  it('does not repeat a day across a fall-back boundary', () => {
    withTimezone('America/Los_Angeles', () => {
      const dates = enumerateLocalDates('2026-10-31', '2026-11-03');
      expect(dates).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
    });
  });
});

describe('refusals', () => {
  it('returns nothing rather than a guess for unusable input', () => {
    expect(enumerateLocalDates('', '2026-10-07')).toEqual([]);
    expect(enumerateLocalDates('not-a-date', '2026-10-07')).toEqual([]);
    expect(addLocalDays('2026-13-45', 1)).toBe('');
    expect(toLocalIsoDate(new Date(NaN))).toBe('');
  });

  it('returns nothing when the end precedes the start', () => {
    expect(enumerateLocalDates('2026-10-07', '2026-10-02')).toEqual([]);
  });

  it('caps a runaway span instead of building an unbounded list', () => {
    expect(enumerateLocalDates('2020-01-01', '2030-01-01')).toHaveLength(366);
    expect(enumerateLocalDates('2026-10-02', '2026-10-07', 3)).toHaveLength(3);
  });

  it('treats a single-day trip as one day', () => {
    expect(enumerateLocalDates('2026-10-02', '2026-10-02')).toEqual(['2026-10-02']);
  });
});
