/**
 * 「你說說可能嗎」 — no, and it was never the region, the wording, or the key.
 *
 * Measured straight at routes.googleapis.com with this project's key,
 * `travelMode: "TRANSIT"`, departing in one hour:
 *
 *   日本 東京 → 新宿   {} — nothing      日本 大阪 → 難波   {} — nothing
 *   台灣 台北 → 板橋   OK                韓國 首爾站 → 江南 OK
 *   香港 中環 → 旺角   OK                新加坡 政府 → 樟宜 OK
 *   英國 倫敦 KX → LBG OK
 *
 * Walking and driving answer normally in Tokyo with the same key, so the
 * Routes API simply does not carry Japanese transit.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultTravelMode,
  transitIsUnavailable,
  transitUnavailableHint,
  transitUnavailableReason,
} from './transitCoverage';

describe('where transit cannot be answered', () => {
  it('knows Japan, in the forms a trip actually stores', () => {
    for (const country of ['日本', 'Japan', 'JP', 'japan']) {
      expect(transitIsUnavailable(country)).toBe(true);
    }
  });

  /** Everything measured as working stays working. */
  it('leaves the countries that do answer alone', () => {
    for (const country of ['台灣', '韓國', '香港', '新加坡', 'United Kingdom', 'Taiwan']) {
      expect(transitIsUnavailable(country)).toBe(false);
    }
  });

  /** An unknown destination is not an excuse to stop asking. */
  it('says nothing about a country it has not measured', () => {
    expect(transitIsUnavailable(undefined)).toBe(false);
    expect(transitIsUnavailable('')).toBe(false);
    expect(transitIsUnavailable('摩納哥')).toBe(false);
  });
});

describe('what the traveller is told', () => {
  /* Pressing the button again cannot help, so the thing that does is named. */
  it('names where the answer actually is', () => {
    expect(transitUnavailableReason('日本')).toContain('Google 地圖 App');
  });

  /*
    「不要只寫查不到」 — 「查不到」 reads as 「there is no train」, in the densest rail
    network on earth. The link directly above this line already says where to
    go, so the line itself is spent on why.
  */
  it('says why rather than repeating where', () => {
    expect(transitUnavailableHint('日本')).toContain('不是沒有車');
    expect(transitUnavailableReason('日本')).toContain('不是沒有車');
  });

  it('says nothing where transit works', () => {
    expect(transitUnavailableReason('台灣')).toBe('');
    expect(transitUnavailableHint('台灣')).toBe('');
  });
});

describe('which mode a leg opens on', () => {
  /*
    Opening on transit in Japan means the first thing shown is a failure, on
    every leg of the trip. Driving is the mode that answers there.
  */
  it('opens on driving in Japan', () => {
    expect(defaultTravelMode('日本')).toBe('DRIVE');
  });

  it('still opens on transit everywhere else', () => {
    expect(defaultTravelMode('韓國')).toBe('TRANSIT');
    expect(defaultTravelMode(undefined)).toBe('TRANSIT');
  });
});
