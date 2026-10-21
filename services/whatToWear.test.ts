import { describe, expect, it } from 'vitest';
import { tomorrowLabel, whatToWear } from './whatToWear';

/**
 * 「少一個明天衣著建議！」
 *
 * Derived from the forecast printed directly above it. A sentence about a
 * jacket is only useful if it agrees with the numbers beside it.
 */
const day = (over: Partial<Parameters<typeof whatToWear>[0]> = {}) => ({
  high: 24, low: 19, precipitationProbability: 10, ...over,
});

describe('whatToWear', () => {
  /*
    Dressed for the cold part of the day, because that is the part somebody
    is unprepared for: a 12° morning is what a jacket is for, even when the
    afternoon reaches 24°.
  */
  it('answers to the morning, not the afternoon', () => {
    expect(whatToWear(day({ high: 24, low: 10 }))[0]).toContain('外套');
  });

  it('says it plainly when it is cold', () => {
    expect(whatToWear(day({ high: 6, low: 2 }))[0]).toContain('厚外套');
  });

  it('says it plainly when it is hot', () => {
    expect(whatToWear(day({ high: 32, low: 26 }))[0]).toContain('偏熱');
  });

  /* A confident 「帶一件薄外套」 at 28° reads as expertise and is wrong. */
  it('does not invent a jacket for a mild day', () => {
    expect(whatToWear(day({ high: 26, low: 21 })).join('')).not.toContain('外套');
  });

  /* The swing is the thing that catches somebody out. */
  it('mentions a wide day-night gap', () => {
    expect(whatToWear(day({ high: 29, low: 19 })).join('')).toContain('溫差');
  });

  it('leaves the swing out when it is small', () => {
    expect(whatToWear(day({ high: 24, low: 20 })).join('')).not.toContain('溫差');
  });

  it('says to take an umbrella when rain is likely', () => {
    expect(whatToWear(day({ precipitationProbability: 55 })).join('')).toContain('帶把傘');
  });

  it('is firmer when rain is very likely', () => {
    expect(whatToWear(day({ precipitationProbability: 80 })).join('')).toContain('一定要帶');
  });

  it('says nothing about rain on a dry day', () => {
    expect(whatToWear(day({ precipitationProbability: 8 })).join('')).not.toContain('傘');
  });
});

describe('tomorrowLabel', () => {
  it('shows the forecast the advice was built on', () => {
    expect(tomorrowLabel(day({ high: 29, low: 19, condition: '多雲' }))).toBe('明天 29° / 19°・多雲');
  });

  it('leaves out a condition nobody gave', () => {
    expect(tomorrowLabel(day({ high: 29, low: 19 }))).toBe('明天 29° / 19°');
  });
});
