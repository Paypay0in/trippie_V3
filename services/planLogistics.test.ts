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

/**
 * 「單程約 29 小時 21 分」, on a six-day plan, with no warning at all.
 *
 * The check used to return true for anything longer than a day before it
 * looked at the measured figure, so the one number on the card that proved
 * the plan was impossible was also the one nothing read.
 *
 * The bar for a multi-day plan stays loose on purpose — an overnight trip
 * five hours away is a real choice, and the test above says so. This is for
 * a figure that says the place is not where the traveller is.
 */
describe('a figure that contradicts the destination', () => {
  it('is caught on a multi-day plan, not only on a day trip', () => {
    // 福岡 to 由布院 is 97 minutes and to 糸島 is 31, measured against the
    // same Routes call the server makes. 1761 is neither.
    expect(dayTripIsRealistic(1761, 6)).toBe(false);
    expect(dayTripIsRealistic(1761, 2)).toBe(false);
    expect(dayTripIsRealistic(1761, 1)).toBe(false);
  });

  it('leaves the plans those trips actually produce alone', () => {
    expect(dayTripIsRealistic(97, 2)).toBe(true);
    expect(dayTripIsRealistic(31, 1)).toBe(true);
    // The overnight trip that is genuinely far, kept.
    expect(dayTripIsRealistic(300, 2)).toBe(true);
  });
});
