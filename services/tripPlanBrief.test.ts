import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIEF,
  briefDayCount,
  briefIsReady,
  briefProblems,
  briefToRequest,
  briefToTripSetup,
  daysBetween,
  TripPlanBrief,
} from './tripPlanBrief';

const brief = (over: Partial<TripPlanBrief> = {}): TripPlanBrief => ({
  ...DEFAULT_BRIEF,
  destination: '韓國 釜山',
  startDate: '2026-10-02',
  endDate: '2026-10-07',
  ...over,
});

describe('how long the trip is', () => {
  /** 10/02–10/07 is six days, which is what the trip card already says. */
  it('counts both ends of the range', () => {
    expect(daysBetween('2026-10-02', '2026-10-07')).toBe(6);
  });

  it('counts a single day as one', () => {
    expect(daysBetween('2026-10-02', '2026-10-02')).toBe(1);
  });

  it('crosses a month and a year', () => {
    expect(daysBetween('2026-10-28', '2026-11-02')).toBe(6);
    expect(daysBetween('2026-12-29', '2027-01-02')).toBe(5);
  });

  it('refuses a range that ends before it starts', () => {
    expect(daysBetween('2026-10-07', '2026-10-02')).toBeNull();
  });

  it('is nothing without a complete range', () => {
    expect(daysBetween('2026-10-02', undefined)).toBeNull();
    expect(daysBetween(undefined, undefined)).toBeNull();
  });

  it('falls back to the approximate count when there are no dates', () => {
    expect(briefDayCount(brief({ startDate: undefined, endDate: undefined, approximateDays: 4 })))
      .toBe(4);
  });

  /** Real dates beat a guess, even when both are present. */
  it('prefers real dates over the approximate count', () => {
    expect(briefDayCount(brief({ approximateDays: 99 }))).toBe(6);
  });
});

describe('what is still missing', () => {
  it('is nothing when the two required answers are there', () => {
    expect(briefProblems(brief())).toEqual([]);
    expect(briefIsReady(brief())).toBe(true);
  });

  it('names the destination when it is blank', () => {
    expect(briefProblems(brief({ destination: '   ' }))).toContain('還沒填要去哪裡');
  });

  it('names the dates when neither dates nor a day count were given', () => {
    expect(briefProblems(brief({ startDate: undefined, endDate: undefined })))
      .toContain('還沒填日期或天數');
  });

  it('accepts a day count instead of dates', () => {
    expect(briefIsReady(brief({ startDate: undefined, endDate: undefined, approximateDays: 5 })))
      .toBe(true);
  });

  /** Zero was answered, not left blank, so it is told apart from blank. */
  it('refuses a trip of no days, or of sixty-one', () => {
    expect(briefProblems(brief({ startDate: undefined, endDate: undefined, approximateDays: 0 })))
      .toContain('天數至少要 1 天');
    expect(briefProblems(brief({ startDate: undefined, endDate: undefined, approximateDays: 61 })))
      .toContain('一次最多規劃 60 天');
  });

  /**
   * Only where and how long are required. Everything else is already on
   * screen with a sensible default, and demanding answers to questions that
   * have defaults is how a form stops being filled in.
   */
  it('does not demand the answers that have defaults', () => {
    expect(briefProblems(brief({ transport: [], notes: undefined }))).toEqual([]);
  });
});

describe('the trip it creates', () => {
  it('passes the dates through exactly', () => {
    expect(briefToTripSetup(brief())).toEqual({
      destination: '韓國 釜山', startDate: '2026-10-02', endDate: '2026-10-07',
    });
  });

  /**
   * A trip with invented dates looks identical to a planned one on the day
   * tabs, the ledger's phases and the refund windows — and the traveller
   * never told us those days.
   */
  it('invents no dates from an approximate day count', () => {
    const setup = briefToTripSetup(
      brief({ startDate: undefined, endDate: undefined, approximateDays: 5 }),
    );
    expect(setup.startDate).toBe('');
    expect(setup.endDate).toBe('');
  });

  it('trims the destination', () => {
    expect(briefToTripSetup(brief({ destination: '  韓國 釜山 ' })).destination).toBe('韓國 釜山');
  });
});

describe('what the model is given', () => {
  it('carries the answers that used to be buried in a paragraph', () => {
    const request = briefToRequest(brief({
      transport: ['drive'], dayStartTime: '11:00', pace: 2, notes: '想去汗蒸幕',
    }));
    expect(request).toMatchObject({
      destination: '韓國 釜山',
      travellers: 2,
      days: 6,
      transport: ['drive'],
      dayStartTime: '11:00',
      stopsPerDay: 2,
      notes: '想去汗蒸幕',
    });
  });

  it('leaves empty notes out rather than sending a blank', () => {
    expect(briefToRequest(brief({ notes: '   ' })).notes).toBeUndefined();
  });

  it('sends the day count even when there are no dates', () => {
    const request = briefToRequest(
      brief({ startDate: undefined, endDate: undefined, approximateDays: 4 }),
    );
    expect(request.days).toBe(4);
    expect(request.startDate).toBeUndefined();
  });
});
