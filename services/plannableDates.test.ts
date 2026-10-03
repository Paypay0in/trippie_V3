import { describe, expect, it } from 'vitest';
import { enumerateTripDates, plannableDates } from './itineraryPlanningService';
import { analyzeExistingItinerary } from './itineraryAdjustment';

/**
 * 「ai排行程會排到已經失效的日期，要讓他先跟本機對時間再排行程」.
 *
 * On 10/04 the planner was still being handed 10/02 and 10/03 as places to put
 * things, because the only dates it knew were the trip's own. A suggestion for
 * a day that has already happened cannot be followed, and it takes the place of
 * one that could have been.
 */

describe('plannableDates', () => {
  it('drops the days already lived', () => {
    expect(plannableDates('2026-10-02', '2026-10-07', '2026-10-04')).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
  });

  it('keeps today itself', () => {
    // The afternoon of a day that started badly is exactly when somebody asks
    // for a new plan.
    expect(plannableDates('2026-10-02', '2026-10-07', '2026-10-04')).toContain('2026-10-04');
  });

  it('is every trip date when the trip has not started', () => {
    expect(plannableDates('2026-11-01', '2026-11-03', '2026-10-04'))
      .toEqual(enumerateTripDates('2026-11-01', '2026-11-03'));
  });

  it('is empty for a trip entirely in the past', () => {
    expect(plannableDates('2026-09-01', '2026-09-05', '2026-10-04')).toEqual([]);
  });

  it('falls back to every trip date when today is unknown or unusable', () => {
    // Without a date to compare against, the old behaviour is the honest one.
    expect(plannableDates('2026-10-02', '2026-10-04', undefined)).toHaveLength(3);
    expect(plannableDates('2026-10-02', '2026-10-04', 'not-a-date')).toHaveLength(3);
  });
});

describe('analyzeExistingItinerary', () => {
  const snapshot = [{
    id: 'it-1', date: '2026-10-05', startTime: '10:00', placeName: '甘川文化村', locked: false,
  }] as never;

  it('does not call a day that has passed empty', () => {
    // 「把空白的日子排滿」 must not offer to fill the 2nd on the 4th: that day is
    // not a gap in the plan, it is the part of the trip that happened.
    const analysis = analyzeExistingItinerary(snapshot, {
      startDate: '2026-10-02',
      endDate: '2026-10-07',
      today: '2026-10-04',
    });

    expect(analysis.emptyDates).not.toContain('2026-10-02');
    expect(analysis.emptyDates).not.toContain('2026-10-03');
    expect(analysis.emptyDates).toContain('2026-10-06');
  });

  it('still reports every empty day of a trip that has not started', () => {
    const analysis = analyzeExistingItinerary(snapshot, {
      startDate: '2026-10-02',
      endDate: '2026-10-07',
      today: '2026-10-01',
    });

    expect(analysis.emptyDates).toContain('2026-10-02');
  });
});
