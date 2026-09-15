import { describe, expect, it } from 'vitest';
import { ProposedItineraryItem } from './itineraryPlanningService';
import {
  DEFAULT_DAY_START,
  parseEarliestStartPreference,
  scheduleProposalDay,
  transitMinutesBetween,
} from './itineraryScheduling';

const item = (
  placeName: string,
  overrides: Partial<ProposedItineraryItem> = {},
): ProposedItineraryItem => ({
  id: `p-${placeName}`,
  placeName,
  sourceInspirationIds: [],
  source: 'ai_suggestion',
  ...overrides,
});

const times = (items: ProposedItineraryItem[]) => items.map(entry => entry.suggestedStartTime);
const names = (items: ProposedItineraryItem[]) => items.map(entry => entry.placeName);

/** The Founder's Day 3: three Busan places the model stamped all at 09:00. */
const HAEDONG = item('海東龍宮寺', { suggestedStartTime: '09:00', durationMinutes: 90, coordinates: { latitude: 35.1885, longitude: 129.2233 } });
const CAPSULE = item('海雲台藍線公園膠囊列車', { suggestedStartTime: '09:00', durationMinutes: 60, coordinates: { latitude: 35.1580, longitude: 129.1700 } });
const BEACH = item('海雲台海水浴場', { suggestedStartTime: '09:00', durationMinutes: 120, coordinates: { latitude: 35.1587, longitude: 129.1604 } });

describe('parseEarliestStartPreference', () => {
  it('reads a day-start instruction out of the user text', () => {
    expect(parseEarliestStartPreference('每天 11 點後出門')).toBe('11:00');
    expect(parseEarliestStartPreference('每天11點才出門，有租車')).toBe('11:00');
    expect(parseEarliestStartPreference('想 10:30 以後再出發')).toBe('10:30');
    expect(parseEarliestStartPreference('start after 11')).toBe('11:00');
  });

  it('does not mistake an unrelated hour or duration for a day start', () => {
    // These must not become a floor for the whole day.
    expect(parseEarliestStartPreference('想安排 2 小時的汗蒸幕')).toBeUndefined();
    expect(parseEarliestStartPreference('不想把行程排太滿')).toBeUndefined();
    expect(parseEarliestStartPreference('')).toBeUndefined();
    expect(parseEarliestStartPreference(undefined)).toBeUndefined();
  });
});

describe('transitMinutesBetween', () => {
  it('scales with distance and falls back when a place is not locatable', () => {
    const near = transitMinutesBetween({ latitude: 35.1587, longitude: 129.1604 }, { latitude: 35.1580, longitude: 129.1700 });
    const far = transitMinutesBetween({ latitude: 35.1885, longitude: 129.2233 }, { latitude: 35.0975, longitude: 129.0107 });
    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThanOrEqual(15);
    expect(transitMinutesBetween(undefined, { latitude: 35.1, longitude: 129.1 })).toBe(30);
  });
});

describe('scheduleProposalDay — the reported bug', () => {
  it('spreads a day the model stamped with one identical time', () => {
    const { items, repaired } = scheduleProposalDay([HAEDONG, CAPSULE, BEACH]);

    expect(repaired).toBe(true);
    // Model order is preserved; only the clock is repaired.
    expect(names(items)).toEqual(['海東龍宮寺', '海雲台藍線公園膠囊列車', '海雲台海水浴場']);
    const assigned = times(items) as string[];
    expect(new Set(assigned).size).toBe(3);
    expect([...assigned].sort()).toEqual(assigned);
    expect(assigned[0]).toBe('09:00');
  });

  it('respects 「每天 11 點後出門」 and still spreads the day', () => {
    const { items } = scheduleProposalDay([HAEDONG, CAPSULE, BEACH], { planningPreferences: '每天 11 點後出門' });
    const assigned = times(items) as string[];

    expect(assigned[0]).toBe('11:00');
    expect(new Set(assigned).size).toBe(3);
    expect([...assigned].sort()).toEqual(assigned);
    // 90 minutes at the temple plus the drive across to 海雲台 lands well after noon.
    expect(assigned[1] > '12:30').toBe(true);
  });

  it('never lets one activity start before the previous one ends', () => {
    const { items } = scheduleProposalDay([HAEDONG, CAPSULE, BEACH], { earliestStart: '11:00' });
    const durations = [90, 60, 120];
    const minutes = (items.map(entry => entry.suggestedStartTime) as string[])
      .map(time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
    for (let index = 0; index + 1 < minutes.length; index += 1) {
      expect(minutes[index + 1]).toBeGreaterThanOrEqual(minutes[index] + durations[index]);
    }
  });
});

describe('scheduleProposalDay — preserving what the model got right', () => {
  it('leaves an already-feasible day byte-identical', () => {
    const morning = item('甘川文化村', { suggestedStartTime: '11:00', durationMinutes: 90, coordinates: { latitude: 35.0975, longitude: 129.0107 } });
    const afternoon = item('札嘎其市場', { suggestedStartTime: '14:00', durationMinutes: 60, coordinates: { latitude: 35.0966, longitude: 129.0308 } });
    const evening = item('廣安里', { suggestedStartTime: '17:30', durationMinutes: 90, coordinates: { latitude: 35.1532, longitude: 129.1186 } });

    const { items, repaired } = scheduleProposalDay([morning, afternoon, evening]);
    expect(repaired).toBe(false);
    expect(times(items)).toEqual(['11:00', '14:00', '17:30']);
    // Untouched items are returned by reference: nothing was recomputed.
    expect(items[0]).toBe(morning);
    expect(items[1]).toBe(afternoon);
    expect(items[2]).toBe(evening);
  });

  it('keeps a generous gap the user clearly wanted', () => {
    const first = item('A', { suggestedStartTime: '09:00', durationMinutes: 30 });
    const second = item('B', { suggestedStartTime: '19:00', durationMinutes: 60 });
    const { items, repaired } = scheduleProposalDay([first, second]);
    expect(repaired).toBe(false);
    expect(times(items)).toEqual(['09:00', '19:00']);
  });

  it('reorders a day whose valid times arrived out of sequence', () => {
    const late = item('晚餐', { suggestedStartTime: '18:00', durationMinutes: 60 });
    const early = item('早市', { suggestedStartTime: '09:00', durationMinutes: 60 });
    const { items } = scheduleProposalDay([late, early]);
    expect(names(items)).toEqual(['早市', '晚餐']);
    expect(times(items)).toEqual(['09:00', '18:00']);
  });
});

describe('scheduleProposalDay — missing and invalid times', () => {
  it('builds a sequential schedule when the model omits every time', () => {
    const { items, repaired } = scheduleProposalDay([
      item('A', { durationMinutes: 60 }),
      item('B', { durationMinutes: 60 }),
      item('C', { durationMinutes: 60 }),
    ]);
    expect(repaired).toBe(true);
    const assigned = times(items) as string[];
    expect(assigned[0]).toBe(DEFAULT_DAY_START);
    expect(new Set(assigned).size).toBe(3);
    // No shared fallback: the ticket's 「do not stamp the same time onto every item」.
    expect(assigned).not.toEqual(['09:00', '09:00', '09:00']);
  });

  it('uses a default visit length for an item with no duration', () => {
    const { items } = scheduleProposalDay([item('A'), item('B')]);
    // 09:00 + 90 minutes + 30 minutes of travel with no coordinates.
    expect(times(items)).toEqual(['09:00', '11:00']);
  });

  it('places untimed items after the timed ones they follow', () => {
    const { items } = scheduleProposalDay([
      item('有時間', { suggestedStartTime: '10:00', durationMinutes: 60 }),
      item('沒時間'),
    ]);
    expect(names(items)).toEqual(['有時間', '沒時間']);
    expect(times(items)).toEqual(['10:00', '11:30']);
  });

  it('leaves an item untimed rather than pushing it past the end of the day', () => {
    const { items, repaired } = scheduleProposalDay([
      item('A', { suggestedStartTime: '20:00', durationMinutes: 180 }),
      item('B', { durationMinutes: 60 }),
    ]);
    expect(repaired).toBe(true);
    expect(times(items)).toEqual(['20:00', undefined]);
  });

  it('handles a single-item day and an empty day', () => {
    expect(times(scheduleProposalDay([item('A', { suggestedStartTime: '14:00' })]).items)).toEqual(['14:00']);
    expect(scheduleProposalDay([])).toEqual({ items: [], repaired: false });
  });

  it('does not mutate the items it was given', () => {
    const original = item('A', { suggestedStartTime: '09:00', durationMinutes: 60 });
    const clash = item('B', { suggestedStartTime: '09:00', durationMinutes: 60 });
    scheduleProposalDay([original, clash]);
    expect(original.suggestedStartTime).toBe('09:00');
    expect(clash.suggestedStartTime).toBe('09:00');
  });
});
