/**
 * 「第一條建議要給一個一鍵」.
 *
 * His own day: 淺草 → 江東 → back to 淺草, which is the 「Taito City 今天跑了兩趟」
 * the check reports and then leaves him to fix by dragging cards.
 */
import { describe, expect, it } from 'vitest';
import { groupDayByArea } from './groupDayByArea';
import { ItineraryItem } from '../types';

const stop = (id: string, time: string, latitude: number, longitude: number, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date: '2026-10-23', time,
  durationMinutes: 60, latitude, longitude, ...over,
} as ItineraryItem);

const ASAKUSA: [number, number] = [35.7148, 139.7967];
const KOTO: [number, number] = [35.6805, 139.8075];

const nothingFixed = () => false;

describe('groupDayByArea', () => {
  /* Leaves 淺草 for 江東 and comes back. */
  const zigzag = [
    stop('leaves', '10:00', ASAKUSA[0], ASAKUSA[1]),
    stop('museum', '12:00', KOTO[0], KOTO[1]),
    stop('lonich', '14:00', ASAKUSA[0] + 0.001, ASAKUSA[1] + 0.001),
  ];

  it('puts the two stops in one area together', () => {
    const times = groupDayByArea(zigzag, nothingFixed);
    const order = Object.entries(times).sort((left, right) => left[1].localeCompare(right[1])).map(entry => entry[0]);

    // Whatever it starts from, the museum is no longer in the middle.
    expect(order.indexOf('museum')).toBe(order.length - 1);
  });

  it('keeps the day starting when it already started', () => {
    const times = groupDayByArea(zigzag, nothingFixed);
    // Unchanged stops are left out of the result, so the day is read back whole.
    const after = zigzag.map(item => times[item.id] || (item.time as string)).sort();

    expect(after[0]).toBe('10:00');
  });

  /* Nothing to offer on a day that is already in a sensible order. */
  it('offers nothing when the order is already right', () => {
    const tidy = [
      stop('a', '10:00', ASAKUSA[0], ASAKUSA[1]),
      stop('b', '12:00', ASAKUSA[0] + 0.001, ASAKUSA[1] + 0.001),
      stop('c', '14:00', KOTO[0], KOTO[1]),
    ];

    expect(groupDayByArea(tidy, nothingFixed)).toEqual({});
  });

  /*
    A day that walks less and finishes an hour later has not been improved, it
    has been extended — and that hour usually has a flight in it.
  */
  it('refuses to run past where the day already ended', () => {
    const packed = [
      stop('a', '10:00', ASAKUSA[0], ASAKUSA[1], { durationMinutes: 120 }),
      stop('b', '12:00', KOTO[0], KOTO[1], { durationMinutes: 120 }),
      stop('c', '14:00', ASAKUSA[0] + 0.001, ASAKUSA[1] + 0.001, { durationMinutes: 120 }),
    ];

    expect(groupDayByArea(packed, nothingFixed)).toEqual({});
  });

  /* Two stops cannot zigzag, so there is nothing to answer. */
  it('says nothing about a short day', () => {
    expect(groupDayByArea(zigzag.slice(0, 2), nothingFixed)).toEqual({});
  });

  /* A flight keeps its hour and is never part of the reordering. */
  it('never moves a fixed stop', () => {
    const withFlight = [...zigzag, stop('flight', '18:00', 35.77, 140.39, { type: 'FLIGHT' })];
    const times = groupDayByArea(withFlight, item => item.type === 'FLIGHT');

    expect(times.flight).toBeUndefined();
  });
});
