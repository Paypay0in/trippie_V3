/**
 * 「現在是晚上十點半 他沒有跟著本機時間在判斷下一站」.
 *
 * Day 1 in Busan, 22:37 local. The card read 下一站 14:35 抵達機場（桃園） — the
 * flight he had already taken, eight hours earlier, from the country he had
 * left. Nothing was ticked off (0/6 項已完成), which is the normal state of an
 * itinerary while somebody is actually travelling, and under the old rule that
 * meant the day pointed at its first item all day long.
 */
import { describe, expect, it } from 'vitest';
import { selectNextStop } from './nextStop';
import { ItineraryItem } from '../types';

const DAY_ONE = '2026-10-02';
const TRIP = { startDate: DAY_ONE, endDate: '2026-10-07' };

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '09:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: DAY_ONE, ...over,
});

/** Local time on the day in question. */
const at = (clock: string, date = DAY_ONE) => new Date(`${date}T${clock}:00`);

/** His day 1, nothing ticked. */
const dayOne = [
  item({ id: 'to-airport', time: '14:35', title: '抵達機場', location: '台灣桃園國際機場' }),
  item({ id: 'takeoff', time: '16:35', title: '航班起飛', location: '台灣桃園國際機場', durationMinutes: 200 }),
  item({ id: 'landing', time: '19:55', title: '航班抵達', location: '金海國際機場' }),
  item({ id: 'checkin', time: '21:55', title: '入住 Kent Hotel Gwangalli' }),
];

describe('晚上十點半的下一站', () => {
  it('不會是早就過去的 14:35 抵達機場', () => {
    expect(selectNextStop(dayOne, at('22:37'), TRIP)?.item.id).not.toBe('to-airport');
  });

  it('今天沒剩下什麼了，就指向明天的第一站', () => {
    const tomorrow = item({ id: 'gamcheon', date: '2026-10-03', time: '10:00', title: '甘川洞文化村' });

    const next = selectNextStop([...dayOne, tomorrow], at('22:37'), TRIP);

    expect(next?.item.id).toBe('gamcheon');
    expect(next?.kind).toBe('later_day');
  });

  it('什麼都沒有就說沒有，而不是硬指一個過去的項目', () => {
    expect(selectNextStop(dayOne, at('22:37'), TRIP)).toBeUndefined();
  });
});

describe('一天之中', () => {
  it('早上看到的是當天第一站', () => {
    const next = selectNextStop(dayOne, at('08:00'), TRIP);

    expect(next?.item.id).toBe('to-airport');
    expect(next?.kind).toBe('today');
  });

  it('14:35 那一刻起，它就是正在進行的那一站', () => {
    const next = selectNextStop(dayOne, at('14:40'), TRIP);

    expect(next?.item.id).toBe('to-airport');
    expect(next?.kind).toBe('now');
  });

  it('飛行途中顯示的是那班飛機，不是已經到的機場', () => {
    const next = selectNextStop(dayOne, at('18:00'), TRIP);

    expect(next?.item.id).toBe('takeoff');
    expect(next?.kind).toBe('now');
  });

  it('飛行時間走完之前都還是那班飛機——19:00 他還在空中', () => {
    expect(selectNextStop(dayOne, at('17:30'), TRIP)?.item.id).toBe('takeoff');
    expect(selectNextStop(dayOne, at('19:00'), TRIP)?.item.id).toBe('takeoff');
    expect(selectNextStop(dayOne, at('19:56'), TRIP)?.item.id).toBe('landing');
  });

  it('沒有停留時間的項目，過了半小時就算過去了', () => {
    expect(selectNextStop(dayOne, at('20:10'), TRIP)?.item.id).toBe('landing');
    expect(selectNextStop(dayOne, at('20:40'), TRIP)?.item.id).toBe('checkin');
  });
});

describe('其他情況', () => {
  it('已完成的項目不會被當成下一站', () => {
    const ticked = dayOne.map(entry => (entry.id === 'checkin' ? { ...entry, isCompleted: true } : entry));

    expect(selectNextStop(ticked, at('21:00'), TRIP)).toBeUndefined();
  });

  it('沒有時間的項目排在有時間的後面，但今天仍然算數', () => {
    const untimed = item({ id: 'shopping', time: '', title: '西面逛街' });

    expect(selectNextStop([untimed, ...dayOne], at('08:00'), TRIP)?.item.id).toBe('to-airport');
    expect(selectNextStop([untimed, ...dayOne], at('22:37'), TRIP)?.item.id).toBe('shopping');
  });

  it('旅程還沒開始或已經結束就沒有下一站', () => {
    expect(selectNextStop(dayOne, at('09:00', '2026-09-30'), TRIP)).toBeUndefined();
    expect(selectNextStop(dayOne, at('09:00', '2026-10-09'), TRIP)).toBeUndefined();
  });

  it('不會指向旅程結束之後的項目', () => {
    const afterTrip = item({ id: 'later', date: '2026-10-20', time: '10:00', title: '下一趟' });

    expect(selectNextStop([...dayOne, afterTrip], at('22:37'), TRIP)).toBeUndefined();
  });
});
