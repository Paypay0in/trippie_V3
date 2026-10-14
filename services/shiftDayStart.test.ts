/**
 * 「橘色處調 紅色處是不是就要調」.
 *
 * His Day 3, as photographed: 幾點出門 set to 11:00, and the first block still
 * reading 10:00–12:00. The grid was protecting the items already on the day
 * and saying nothing about it, so the input looked broken.
 */
import { describe, expect, it } from 'vitest';
import { shiftDayToStart } from './shiftDayStart';
import { ItineraryItem } from '../types';

const item = (id: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY',
  date: '2026-10-22', time, durationMinutes: 120, ...over,
} as ItineraryItem);

/* His Day 3. */
const day = [
  item('shinjuku', '10:00'),
  item('ramen', '12:30', { durationMinutes: 60 }),
  item('tsutaya', '14:30'),
  item('nakameguro', '16:30', { durationMinutes: 90 }),
];

describe('moving the day to the time they leave', () => {
  it('moves everything by the same amount, keeping the gaps', () => {
    const { items, movedCount, shiftMinutes } = shiftDayToStart(day, '11:00');

    expect(shiftMinutes).toBe(60);
    expect(movedCount).toBe(4);
    expect(items.map(entry => entry.time)).toEqual(['11:00', '13:30', '15:30', '17:30']);
  });

  /*
    「航班時間是固定的行程」 — the day is built around them, and an app that
    quietly re-timed a boarding pass would be worse than one that did nothing.
  */
  it('never moves a flight or anything derived from one', () => {
    const withFlight = [
      item('landing', '06:35', { type: 'FLIGHT' }),
      item('transfer', '08:00', { derivedFromFlightAnchorId: 'anchor-1' }),
      item('shinjuku', '10:00'),
    ];

    const { items, movedCount } = shiftDayToStart(withFlight, '11:00');

    expect(items[0].time).toBe('06:35');
    expect(items[1].time).toBe('08:00');
    expect(items[2].time).toBe('11:00');
    expect(movedCount).toBe(1);
  });

  /* Dragging a plan earlier into the morning is a decision nobody asked for. */
  it('does nothing when the day already starts later than that', () => {
    expect(shiftDayToStart(day, '09:00').movedCount).toBe(0);
    expect(shiftDayToStart(day, '10:00').movedCount).toBe(0);
  });

  /*
    A day that cannot absorb the shift keeps its plan rather than wrapping an
    evening into the small hours.
  */
  it('refuses rather than pushing anything past midnight', () => {
    const late = [item('dinner', '20:00'), item('bar', '22:30')];

    expect(shiftDayToStart(late, '23:00').movedCount).toBe(0);
  });

  it('ignores a time that is not a time', () => {
    expect(shiftDayToStart(day, '').movedCount).toBe(0);
    expect(shiftDayToStart(day, '25:00').movedCount).toBe(0);
  });

  /* A day holding only a flight has nothing this can move. */
  it('says so when there is nothing movable', () => {
    const onlyFlight = [item('landing', '06:35', { type: 'FLIGHT' })];

    expect(shiftDayToStart(onlyFlight, '11:00').movedCount).toBe(0);
  });
});
