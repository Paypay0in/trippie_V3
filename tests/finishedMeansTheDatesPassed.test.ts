/**
 * 「我感覺語意矛盾」 → Founder answer: A.
 *
 * This app had two 「結束」. The card on the home screen called a trip
 * 已結束的旅程 the day its return date passed; the counter on 我 and the list
 * on the trip shelf called a trip 完成 only once it had been archived by hand.
 * So a trip could be finished and not completed at the same time, and the
 * counter read 0 for a traveller who had just come home.
 *
 * A: finished is a fact about the calendar. Archiving is tidying up — it puts
 * a trip away, it does not decide whether it happened.
 *
 * Pinned here as one rule, used by every screen that counts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countFinishedTrips, tripIsFinished } from '../services/tripIsFinished';

const daysFromToday = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const over = { id: 'a', startDate: daysFromToday(-9), endDate: daysFromToday(-5) };
const underWay = { id: 'b', startDate: daysFromToday(-1), endDate: daysFromToday(2) };
const upcoming = { id: 'c', startDate: daysFromToday(5), endDate: daysFromToday(9) };
const undated = { id: 'd', startDate: '', endDate: '' };

describe('what makes a trip finished', () => {
  it('is the return date having passed', () => {
    expect(tripIsFinished(over)).toBe(true);
  });

  it('is not true while the traveller is still away', () => {
    // The last day is still the trip, not the aftermath.
    expect(tripIsFinished(underWay)).toBe(false);
    expect(tripIsFinished(upcoming)).toBe(false);
  });

  it('is not true for a trip with no dates at all', () => {
    // An idea with no dates has not happened. Counting it as finished would
    // report a journey nobody took.
    expect(tripIsFinished(undated)).toBe(false);
  });
});

describe('how many trips are finished', () => {
  it('counts a trip that is over even though nobody archived it', () => {
    // The defect: 完成的旅程 read 0 the day after a real trip ended.
    expect(countFinishedTrips([], [over])).toBe(1);
  });

  it('counts an archived trip whatever its dates say', () => {
    // Putting a trip away is a statement that it is done with. The calendar
    // decides the unarchived ones; archiving is never un-decided by it.
    expect(countFinishedTrips([{ ...upcoming }], [])).toBe(1);
  });

  it('does not count the same trip twice when it is in both lists', () => {
    expect(countFinishedTrips([over], [over])).toBe(1);
  });

  it('leaves out trips still ahead or under way', () => {
    expect(countFinishedTrips([], [underWay, upcoming, undated])).toBe(0);
  });
});

describe('where the screens get that number', () => {
  it('does not count archived trips as the completed total', () => {
    // 「完成的旅程」 read `tripHistory.length` — archived trips — which is the
    // answer the Founder rejected. Read as source: a UI test would pass with
    // an empty history either way, which is exactly the state it was wrong in.
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).not.toContain('completedTripCount={tripHistory.length}');
    expect(app).toContain('completedTripCount={countFinishedTrips(');
  });
});
