/**
 * 「要去調整說法」.
 *
 * 「這個地區查不到大眾運輸路線」 appeared under two cards that were both Taiwan
 * Taoyuan International Airport. The sentence made a claim about the region —
 * one of the best-connected transit hubs in the country — when all the app had
 * learned was about one pair of points, and it blamed the place for a lookup
 * of ours.
 */
import { describe, expect, it } from 'vitest';
import { isSameSpot, metresBetween, noRouteDetail, noRouteSummary } from './transportLegWording';

const TAOYUAN = { latitude: 25.0777, longitude: 121.2328 };
const NARITA = { latitude: 35.772, longitude: 140.3929 };
/** Terminal 2, about a kilometre from the coordinate the directory holds. */
const TAOYUAN_T2 = { latitude: 25.0862, longitude: 121.2329 };
/** A gate, a couple of hundred metres along the same terminal. */
const TAOYUAN_GATE = { latitude: 25.0783, longitude: 121.2332 };

describe('telling "here" from "could not find the way"', () => {
  it('reads two points at one airport as the same spot', () => {
    expect(isSameSpot(TAOYUAN, TAOYUAN_GATE)).toBe(true);
  });

  it('does not read two airports as the same spot', () => {
    expect(isSameSpot(TAOYUAN, NARITA)).toBe(false);
  });

  /** A kilometre apart is a walk, and a walk is worth timing. */
  it('does not swallow a journey across a large site', () => {
    expect(isSameSpot(TAOYUAN, TAOYUAN_T2)).toBe(false);
  });

  it('measures roughly the real distance', () => {
    // Taoyuan to Narita is about 2,100km.
    expect(metresBetween(TAOYUAN, NARITA) / 1000).toBeGreaterThan(2000);
    expect(metresBetween(TAOYUAN, NARITA) / 1000).toBeLessThan(2300);
  });
});

describe('what it says', () => {
  it('claims nothing about the region', () => {
    expect(noRouteSummary('大眾運輸', false)).not.toContain('地區');
    expect(noRouteDetail('大眾運輸', false)).not.toContain('地區');
  });

  /** The mode chips sit directly above; a dead end should point at them. */
  it('points at the other modes', () => {
    expect(noRouteDetail('大眾運輸', false)).toContain('其他方式');
  });

  it('says there is nothing to arrange when it is the same place', () => {
    expect(noRouteSummary('大眾運輸', true)).toContain('同一個地點');
    expect(noRouteDetail('大眾運輸', true)).toContain('沒有需要安排的交通');
  });

  /** Only a failed lookup is worth another tap. */
  it('does not invite a retry that cannot help', () => {
    expect(noRouteDetail('大眾運輸', true)).not.toContain('其他方式');
  });

  it('names the mode that was tried', () => {
    expect(noRouteSummary('步行', false)).toContain('步行');
  });
});
