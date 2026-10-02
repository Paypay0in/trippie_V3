/**
 * 「新版本的時間序依然是錯誤的 邏輯要正確啊 先離開機場才會去旅館入住」.
 *
 * The rule was fixed; his screen was not. His check-in was written at intake
 * under the old rule and stored as 21:55 — the exact minute he walks out of
 * Gimhae — so the new rule, which only corrected a booking still sitting on
 * the 15:00 default, never touched it. 入住 21:55 kept rendering above
 * 前往飯店 21:55.
 */
import { describe, expect, it } from 'vitest';
import { checkInTimeFromArrival, UNINFORMED_CHECK_IN_TIME } from './airportTransfer';
import { departAirportTime, reachHotelTime } from './arrivalPlan';
import { orderItemsForDay } from './itineraryOrdering';
import { ItineraryItem } from '../types';

const LANDING = '19:55';

describe('修正已經存進去的入住時間', () => {
  it('停在「走出航廈那一分鐘」的入住時間會被往後移——沒有人會自己打那個時間', () => {
    expect(departAirportTime(LANDING)).toBe('21:55');
    expect(checkInTimeFromArrival('21:55', LANDING)).toBe('22:25');
  });

  it('仍然會修正停在 15:00 預設值的那種', () => {
    expect(checkInTimeFromArrival(UNINFORMED_CHECK_IN_TIME, LANDING)).toBe(reachHotelTime(LANDING));
  });

  it('旅客自己挑的時間不會被動到', () => {
    expect(checkInTimeFromArrival('23:30', LANDING)).toBeUndefined();
    expect(checkInTimeFromArrival('14:00', LANDING)).toBeUndefined();
  });

  it('已經是正確時間時不再重算，避免每次編輯航班都重寫一次', () => {
    expect(checkInTimeFromArrival('22:25', LANDING)).toBeUndefined();
  });
});

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '21:55', title: '', location: '', notes: '', type: 'ACTIVITY', date: '2026-10-02', ...over,
});

describe('同一分鐘時誰排前面', () => {
  /*
    Belt and braces for the same complaint: even if two cards do land on the
    same minute, getting somewhere comes before being there.
  */
  it('前往飯店排在入住飯店之前', () => {
    const ordered = orderItemsForDay([
      item({ id: 'checkin', type: 'HOTEL', title: '入住 Kent Hotel' }),
      item({ id: 'transfer', type: 'TRANSPORT', title: '前往 Kent Hotel' }),
    ]);

    expect(ordered.map(entry => entry.id)).toEqual(['transfer', 'checkin']);
  });

  it('航班排在接駁之前', () => {
    const ordered = orderItemsForDay([
      item({ id: 'ride', type: 'TRANSPORT', title: '前往飯店' }),
      item({ id: 'landing', type: 'FLIGHT', title: '航班抵達' }),
    ]);

    expect(ordered.map(entry => entry.id)).toEqual(['landing', 'ride']);
  });

  it('時間不同時還是照時間排，順位只在同一分鐘才起作用', () => {
    const ordered = orderItemsForDay([
      item({ id: 'checkin', time: '14:00', type: 'HOTEL' }),
      item({ id: 'transfer', time: '21:55', type: 'TRANSPORT' }),
    ]);

    expect(ordered.map(entry => entry.id)).toEqual(['checkin', 'transfer']);
  });

  it('使用者手動排過的順序不會被這條規則推翻', () => {
    const ordered = orderItemsForDay([
      item({ id: 'checkin', type: 'HOTEL', sortOrder: 0 }),
      item({ id: 'transfer', type: 'TRANSPORT', sortOrder: 1 }),
    ]);

    expect(ordered.map(entry => entry.id)).toEqual(['checkin', 'transfer']);
  });
});
