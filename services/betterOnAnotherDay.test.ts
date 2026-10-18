/**
 * 「假設某個行程移去另一天更順 也可以建議」.
 *
 * 優化動線 moves whole areas between days. What it cannot say is 「this one
 * stop belongs with Thursday」: an area of one has no majority to move.
 */
import { describe, expect, it } from 'vitest';
import { betterOnAnotherDay, WORTH_MOVING_KM } from './betterOnAnotherDay';
import { ItineraryItem } from '../types';

const stop = (id: string, date: string, time: string, latitude: number, longitude: number, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY', date, time,
  durationMinutes: 90, latitude, longitude, address: 'Tokyo', ...over,
} as ItineraryItem);

/* 淺草 on the 21st, 澀谷 on the 22nd — and one 澀谷 stop stranded on the 21st. */
const ASAKUSA = [35.7148, 139.7967] as const;
const SHIBUYA = [35.6595, 139.7005] as const;

const trip = [
  stop('senso', '2026-10-21', '10:00', ASAKUSA[0], ASAKUSA[1]),
  stop('harry', '2026-10-21', '13:00', ASAKUSA[0] + 0.001, ASAKUSA[1] + 0.001),
  stop('stray', '2026-10-21', '16:00', SHIBUYA[0], SHIBUYA[1]),
  stop('sky', '2026-10-22', '10:00', SHIBUYA[0] + 0.001, SHIBUYA[1] + 0.001),
  stop('tsutaya', '2026-10-22', '13:00', SHIBUYA[0] + 0.002, SHIBUYA[1] + 0.002),
];

describe('betterOnAnotherDay', () => {
  it('spots the stop stranded on the wrong day', () => {
    const [first] = betterOnAnotherDay(trip);

    expect(first.itemId).toBe('stray');
    expect(first.fromDate).toBe('2026-10-21');
    expect(first.toDate).toBe('2026-10-22');
    expect(first.savesKm).toBeGreaterThan(WORTH_MOVING_KM);
  });

  /* A day that is already coherent has nothing to give away. */
  it('says nothing about a trip where every stop is already placed', () => {
    const tidy = trip.filter(item => item.id !== 'stray');

    expect(betterOnAnotherDay(tidy)).toEqual([]);
  });

  /*
    Emptying a day is not shortening it. A stop that is the only thing on its
    day has nowhere to have been.
  */
  it('never suggests emptying a day', () => {
    const lonely = [
      stop('alone', '2026-10-21', '10:00', SHIBUYA[0], SHIBUYA[1]),
      stop('sky', '2026-10-22', '10:00', SHIBUYA[0] + 0.001, SHIBUYA[1] + 0.001),
      stop('tsutaya', '2026-10-22', '13:00', SHIBUYA[0] + 0.002, SHIBUYA[1] + 0.002),
    ];

    expect(betterOnAnotherDay(lonely)).toEqual([]);
  });

  /* A flight is what a day is built around and is never offered up. */
  it('never suggests moving an anchor', () => {
    const withFlight = [
      ...trip,
      stop('flight-landing-f1', '2026-10-21', '08:00', 35.772, 140.3929, {
        type: 'FLIGHT', derivedFromFlightAnchorId: 'f1',
      }),
    ];

    expect(betterOnAnotherDay(withFlight).some(entry => entry.itemId.startsWith('flight-'))).toBe(false);
  });

  /* Below the threshold it is asking somebody to redo a day for nothing. */
  it('stays quiet about a saving nobody would notice', () => {
    const nearlyTheSame = [
      stop('a', '2026-10-21', '10:00', 35.7148, 139.7967),
      stop('b', '2026-10-21', '13:00', 35.7149, 139.7968),
      stop('c', '2026-10-22', '10:00', 35.7150, 139.7969),
      stop('d', '2026-10-22', '13:00', 35.7151, 139.7970),
    ];

    expect(betterOnAnotherDay(nearlyTheSame)).toEqual([]);
  });

  it('needs more than one day to have an opinion', () => {
    expect(betterOnAnotherDay(trip.filter(item => item.date === '2026-10-21'))).toEqual([]);
  });

  /* One suggestion per stop: the best day, not every day that would do. */
  it('offers each stop once', () => {
    const ids = betterOnAnotherDay(trip).map(entry => entry.itemId);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
