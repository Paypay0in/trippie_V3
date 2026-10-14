/**
 * 「你看這邊行程與行程中間」.
 *
 * The timeline offered 大眾運輸 / 開車 / 步行 between 抵達機場 and 航班起飛 — the
 * same building — and again between 航班起飛 and 航班抵達, which is the flight.
 * Both came back 「這個地區查不到大眾運輸路線」, which is true: there is no bus
 * from Taoyuan to Narita.
 */
import { describe, expect, it } from 'vitest';
import { hasGroundJourneyBetween } from './transportLegVisibility';

const derived = (anchorId: string) => ({ derivedFromFlightAnchorId: anchorId });
const ownItem = () => ({ derivedFromFlightAnchorId: undefined });

describe('between two cards of the same flight', () => {
  it('offers no journey between 抵達機場 and 航班起飛', () => {
    expect(hasGroundJourneyBetween(derived('f-1'), derived('f-1'))).toBe(false);
  });

  it('offers no journey between 航班起飛 and 航班抵達', () => {
    expect(hasGroundJourneyBetween(derived('f-1'), derived('f-1'))).toBe(false);
  });
});

describe('everywhere else', () => {
  /** Landing, then the ride into town — the leg that matters most. */
  it('still offers one after the flight lands', () => {
    expect(hasGroundJourneyBetween(derived('f-1'), ownItem())).toBe(true);
  });

  it('still offers one on the way to the airport', () => {
    expect(hasGroundJourneyBetween(ownItem(), derived('f-1'))).toBe(true);
  });

  /** A connection is two aeroplanes with a real walk between them. */
  it('still offers one between two different flights', () => {
    expect(hasGroundJourneyBetween(derived('f-1'), derived('f-2'))).toBe(true);
  });

  it('still offers one between two ordinary places', () => {
    expect(hasGroundJourneyBetween(ownItem(), ownItem())).toBe(true);
  });
});
