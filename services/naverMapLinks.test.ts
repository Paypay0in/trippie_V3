import { describe, expect, it } from 'vitest';
import { canOpenInNaver, naverPlaceUrl } from './naverMapLinks';

/**
 * Verified on a real iPhone with NAVER Map installed:
 *
 *   lat/lng/name  → app opened, pin on 성수동, card titled with our `name`
 *   latitude/longitude → app opened, sat on the traveller's own location in
 *                        Taiwan, 「Out of service range」, no pin, no error
 *
 * The second one is why most of this file is about refusing to build a link.
 */

const seongsu = {
  placeName: '성수동',
  coordinates: { latitude: 37.5447, longitude: 127.0557 },
};

describe('the link that was verified on a phone', () => {
  it('is the Universal Link host, which declares the app', () => {
    expect(naverPlaceUrl(seongsu)).toContain('https://app.map.naver.com/launchApp/place?');
  });

  it('carries the four parameters the app actually read', () => {
    const url = new URL(naverPlaceUrl(seongsu)!);
    expect(url.searchParams.get('lat')).toBe('37.5447');
    expect(url.searchParams.get('lng')).toBe('127.0557');
    expect(url.searchParams.get('name')).toBe('성수동');
    expect(url.searchParams.get('appname')).toBe('com.trippie.app');
  });

  /** map.naver.com declares no app, and was confirmed to open the web only. */
  it('never points at the host that cannot open the app', () => {
    expect(naverPlaceUrl(seongsu)).not.toContain('://map.naver.com');
  });

  it('escapes a name with spaces and punctuation', () => {
    const url = naverPlaceUrl({ ...seongsu, placeName: 'Cafe & Bar 성수' })!;
    expect(url).not.toContain(' ');
    expect(new URL(url).searchParams.get('name')).toBe('Cafe & Bar 성수');
  });
});

describe('when there is no point to send', () => {
  /**
   * The A4 result, as a rule. A missing coordinate does not produce a broken
   * link, it produces a working link to the wrong place — and the traveller
   * cannot tell, because the app opens either way.
   */
  it('builds nothing without coordinates', () => {
    expect(naverPlaceUrl({ placeName: '성수동' })).toBeNull();
  });

  it('builds nothing with only one coordinate', () => {
    expect(naverPlaceUrl({ placeName: 'x', coordinates: { latitude: 37.5, longitude: NaN } }))
      .toBeNull();
    expect(naverPlaceUrl({ placeName: 'x', coordinates: { latitude: NaN, longitude: 127 } }))
      .toBeNull();
  });

  /** 0,0 is in the Atlantic, but it is a real point and not our business. */
  it('accepts zero, which is a coordinate and not a missing one', () => {
    expect(naverPlaceUrl({ placeName: 'x', coordinates: { latitude: 0, longitude: 0 } }))
      .not.toBeNull();
  });

  it('says plainly whether a place can be opened at all', () => {
    expect(canOpenInNaver(seongsu)).toBe(true);
    expect(canOpenInNaver({ placeName: '성수동' })).toBe(false);
  });

  /** An unnamed place still has a point; the label is the only thing missing. */
  it('still builds a link for a place with no name', () => {
    const url = naverPlaceUrl({ ...seongsu, placeName: '' })!;
    expect(new URL(url).searchParams.get('name')).toBe('目的地');
  });
});
