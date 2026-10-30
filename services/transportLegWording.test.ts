/**
 * 「要去調整說法」.
 *
 * 「這個地區查不到大眾運輸路線」 appeared under two cards that were both Taiwan
 * Taoyuan International Airport. The sentence made a claim about the region —
 * one of the best-connected transit hubs in the country — when all the app had
 * learned was about one pair of points, and it blamed the place for a lookup
 * of ours.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isSameSpot,
  metresBetween,
  noRouteDetail,
  noRouteSummary,
  roughTransitDetail,
  roughTransitSummary,
} from './transportLegWording';
import i18n from '../i18n/config';
import { loadPendingLocales } from '../i18n/pendingBundles';

/**
 * The sentences live in the bundles now, so the assertions resolve through
 * them in both languages. A test reading the return value without the bundle
 * loaded would be asserting on a key, and a key protects nothing the old
 * assertions protected.
 */
beforeAll(() => {
  loadPendingLocales();
});

/** This file is specifically about language, so it moves it and puts it back. */
const inLanguage = (language: 'zh-Hant' | 'en') => i18n.changeLanguage(language);

afterAll(() => inLanguage('zh-Hant'));

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

describe('what it says, in Chinese', () => {
  beforeAll(() => inLanguage('zh-Hant'));

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

/**
 * The same promises in English. This is what batch E could not close: it
 * handed these functions a translated mode name, which until now landed in the
 * middle of a Chinese sentence.
 */
describe('what it says, in English', () => {
  beforeAll(() => inLanguage('en'));

  it('claims nothing about the region', () => {
    expect(noRouteSummary('Transit', false).toLowerCase()).not.toContain('region');
    expect(noRouteDetail('Transit', false).toLowerCase()).not.toContain('region');
  });

  it('points at the other modes', () => {
    expect(noRouteDetail('Transit', false).toLowerCase()).toContain('other');
  });

  it('says there is nothing to arrange when it is the same place', () => {
    expect(noRouteSummary('Transit', true).toLowerCase()).toContain('same place');
    expect(noRouteDetail('Transit', true).toLowerCase()).toContain('no travel to arrange');
  });

  it('does not invite a retry that cannot help', () => {
    expect(noRouteDetail('Transit', true).toLowerCase()).not.toContain('other');
  });

  it('names the mode that was tried', () => {
    expect(noRouteSummary('Walking', false)).toContain('Walking');
  });

  /** The whole point of the batch: no Chinese left in an English sentence. */
  it('leaves no Chinese in the English sentences', () => {
    const han = /[㐀-䶿一-鿿]/;
    expect(han.test(noRouteSummary('Transit', false))).toBe(false);
    expect(han.test(noRouteDetail('Transit', false))).toBe(false);
    expect(han.test(noRouteSummary('Transit', true))).toBe(false);
    expect(han.test(noRouteDetail('Transit', true))).toBe(false);
    expect(han.test(roughTransitSummary(25))).toBe(false);
    expect(han.test(roughTransitDetail(25))).toBe(false);
  });
});

/**
 * An estimate has to keep saying it is one, in both languages. A number that
 * loses its 「估算」 becomes a timetable the traveller plans a last train around.
 */
describe('the rough transit estimate', () => {
  it('carries the number and the caveat in Chinese', async () => {
    await inLanguage('zh-Hant');
    expect(roughTransitSummary(25)).toContain('25');
    expect(roughTransitDetail(25)).toContain('25');
    expect(roughTransitSummary(25)).toContain('粗估');
    expect(roughTransitDetail(25)).toContain('估算');
  });

  it('carries the number and the caveat in English', async () => {
    await inLanguage('en');
    expect(roughTransitSummary(25)).toContain('25');
    expect(roughTransitDetail(25)).toContain('25');
    expect(roughTransitSummary(25).toLowerCase()).toContain('roughly');
    expect(roughTransitDetail(25).toLowerCase()).toContain('estimate');
  });
});
