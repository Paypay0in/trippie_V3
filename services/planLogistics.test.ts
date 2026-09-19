import { describe, expect, it } from 'vitest';
import { dayTripIsRealistic, travelBurden, travelTimeLabel } from './planLogistics';

describe('plan logistics', () => {
  it('bands a real travel time', () => {
    expect(travelBurden(35)).toBe('low');
    expect(travelBurden(120)).toBe('medium');
    expect(travelBurden(260)).toBe('high');
  });

  it('says nothing when routing had no answer', () => {
    // A guessed 「交通負擔低」 is what puts someone on an unplanned four-hour bus.
    expect(travelBurden(undefined)).toBeUndefined();
    expect(travelBurden(0)).toBeUndefined();
    expect(travelBurden(Number.NaN)).toBeUndefined();
    expect(travelTimeLabel(undefined)).toBe('');
  });

  it('writes the time the way a person would say it', () => {
    expect(travelTimeLabel(45)).toBe('單程約 45 分鐘');
    expect(travelTimeLabel(120)).toBe('單程約 2 小時');
    expect(travelTimeLabel(130)).toBe('單程約 2 小時 10 分');
  });

  it('rejects a day trip that is mostly travelling', () => {
    expect(dayTripIsRealistic(200, 1)).toBe(false);
    expect(dayTripIsRealistic(150, 1)).toBe(true);
  });

  it('leaves overnight plans alone and does not judge without a number', () => {
    expect(dayTripIsRealistic(300, 2)).toBe(true);
    expect(dayTripIsRealistic(undefined, 1)).toBe(true);
  });
});
