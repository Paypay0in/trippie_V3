import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import { pinnedConflictDates, tripDays, tripDaysBrief } from './tripFreeDays';

const item = (date: string, isPinned = false): ItineraryItem =>
  ({ id: `${date}-${isPinned}`, date, time: '10:00', title: '既有行程', location: '', notes: '', type: 'ACTIVITY', isPinned } as ItineraryItem);

const range = { startDate: '2027-01-10', endDate: '2027-01-13' };

describe('trip days', () => {
  it('walks every day of the trip', () => {
    const days = tripDays({ ...range, itinerary: [] });
    expect(days.map(day => day.date)).toEqual(['2027-01-10', '2027-01-11', '2027-01-12', '2027-01-13']);
    expect(days.every(day => day.isFree)).toBe(true);
  });

  it('marks a day holding something pinned', () => {
    const days = tripDays({ ...range, itinerary: [item('2027-01-12', true)] });
    const pinnedDay = days.find(day => day.date === '2027-01-12');
    expect(pinnedDay?.hasPinned).toBe(true);
    expect(pinnedDay?.isFree).toBe(false);
  });

  it('counts a busy but unpinned day as occupied, not untouchable', () => {
    const days = tripDays({ ...range, itinerary: [item('2027-01-11')] });
    const busy = days.find(day => day.date === '2027-01-11');
    expect(busy?.hasPinned).toBe(false);
    expect(busy?.isFree).toBe(false);
  });

  it('refuses nonsense date ranges rather than walking for years', () => {
    expect(tripDays({ startDate: '2027-01-10', endDate: '2027-01-09', itinerary: [] })).toEqual([]);
    expect(tripDays({ startDate: '2020-01-01', endDate: '2030-01-01', itinerary: [] })).toEqual([]);
    expect(tripDays({ itinerary: [] })).toEqual([]);
  });

  it('tells the planner which days are free and which are untouchable', () => {
    const brief = tripDaysBrief(tripDays({ ...range, itinerary: [item('2027-01-12', true)] }));
    expect(brief).toContain('共 4 天');
    expect(brief).toContain('2027-01-10');
    expect(brief).toContain('不要安排會佔掉整天的方案：2027-01-12');
  });

  it('reports a collision rather than quietly moving the plan', () => {
    const days = tripDays({ ...range, itinerary: [item('2027-01-11', true)] });
    expect(pinnedConflictDates(days, '2027-01-10', 2)).toEqual(['2027-01-11']);
    expect(pinnedConflictDates(days, '2027-01-12', 2)).toEqual([]);
  });
});
