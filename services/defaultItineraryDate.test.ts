import { describe, expect, it } from 'vitest';
import { defaultItineraryDate } from './localDate';

/**
 * 「比方說今日已經 day 3 打開行程表的時候 預設就不要再從 day1 開始」.
 *
 * Opening on the first day is right exactly once — before the trip starts. On
 * the third morning it costs two taps before the screen says anything about
 * today, every time the app is opened.
 */

const busan = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
const at = (iso: string) => new Date(`${iso}T09:00:00`);

describe('defaultItineraryDate', () => {
  it('opens on today while the trip is running', () => {
    expect(defaultItineraryDate(busan, at('2026-10-04'))).toBe('2026-10-04');
  });

  it('opens on the first day before the trip starts', () => {
    // Nothing has happened yet, and the first day is the one being planned.
    expect(defaultItineraryDate(busan, at('2026-09-20'))).toBe('2026-10-02');
  });

  it('opens on the last day once the trip is over', () => {
    // Where it ended, and where its final notes and spending are.
    expect(defaultItineraryDate(busan, at('2026-11-01'))).toBe('2026-10-07');
  });

  it('opens on the first day on the morning the trip begins', () => {
    expect(defaultItineraryDate(busan, at('2026-10-02'))).toBe('2026-10-02');
  });

  it('opens on the last day on the day it ends', () => {
    expect(defaultItineraryDate(busan, at('2026-10-07'))).toBe('2026-10-07');
  });

  it('has nothing to open on an empty trip', () => {
    expect(defaultItineraryDate([], at('2026-10-04'))).toBeUndefined();
  });
});
