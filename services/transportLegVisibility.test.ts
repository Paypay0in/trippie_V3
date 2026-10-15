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

/**
 * 「航班起飛（桃園）→ 🚗 查不到這段的開車路線 → 東京都現代美術館」.
 *
 * Honest about the lookup and wrong about the question: there is no drive from
 * Taoyuan to Kōtō, and asking produced a card offering 大眾運輸 / 開車 / 步行
 * across an ocean.
 */
describe('隔著一片海的兩個行程', () => {
  const taoyuan = { latitude: 25.0797, longitude: 121.2342, derivedFromFlightAnchorId: 'out' };
  const museum = { latitude: 35.6797, longitude: 139.8003 };
  const shibuya = { latitude: 35.6580, longitude: 139.7016 };

  it('不問那一段要怎麼走', () => {
    expect(hasGroundJourneyBetween(taoyuan, museum)).toBe(false);
  });

  /* 成田 to the city is sixty kilometres and is a real drive. */
  it('機場到市區照常問', () => {
    const narita = { latitude: 35.7720, longitude: 140.3929, derivedFromFlightAnchorId: 'out' };
    expect(hasGroundJourneyBetween(narita, museum)).toBe(true);
  });

  it('市區兩點之間照常問', () => {
    expect(hasGroundJourneyBetween(museum, shibuya)).toBe(true);
  });

  /* Without coordinates there is nothing to measure, and the old rule stands. */
  it('沒有座標時維持原本的判斷', () => {
    expect(hasGroundJourneyBetween({ derivedFromFlightAnchorId: 'out' }, {})).toBe(true);
  });
});
