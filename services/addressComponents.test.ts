/**
 * 「筆記我希望以國家。城市 為單位」.
 *
 * Every saved note was filed under its country, because the city written onto
 * a save came from the trip's destination field — which on a Japan trip built
 * from a boarding pass holds 「日本」. Google had the town the whole time:
 * `addressComponents` has been in both place field masks for as long as they
 * have existed, and only the country was ever read out of them.
 */
import { describe, expect, it } from 'vitest';
import { cityFromComponents } from './addressComponents';

const component = (longText: string, ...types: string[]) => ({ longText, types });

describe('reading the town off an address', () => {
  it('takes the locality', () => {
    expect(cityFromComponents([
      component('日本', 'country'),
      component('東京都', 'administrative_area_level_1'),
      component('台東区', 'locality'),
    ])).toBe('台東区');
  });

  /* A ward says more to somebody standing in Tokyo than 東京都 does. */
  it('prefers a ward over the prefecture', () => {
    expect(cityFromComponents([
      component('東京都', 'administrative_area_level_1'),
      component('渋谷区', 'sublocality_level_1'),
    ])).toBe('渋谷区');
  });

  it('falls back to the prefecture for a place in no town', () => {
    expect(cityFromComponents([
      component('日本', 'country'),
      component('北海道', 'administrative_area_level_1'),
    ])).toBe('北海道');
  });

  /** Nothing to go on is answered with nothing, never with the country. */
  it('says nothing when there is no town of any kind', () => {
    expect(cityFromComponents([component('日本', 'country')])).toBeUndefined();
    expect(cityFromComponents([])).toBeUndefined();
    expect(cityFromComponents(undefined)).toBeUndefined();
  });

  it('works for Korea too', () => {
    expect(cityFromComponents([
      component('대한민국', 'country'),
      component('부산광역시', 'administrative_area_level_1'),
      component('해운대구', 'sublocality_level_1'),
    ])).toBe('해운대구');
  });
});
