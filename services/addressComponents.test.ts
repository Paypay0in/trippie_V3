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

describe('reading the city off an address', () => {
  /*
    「不要以區為單位，要是城市。日本。東京 這樣」. Ward level is what an *area
    heading* wants, and `districtOf` still does that — a saved note belongs
    under the city somebody says they went to, and nobody says 台東区.
  */
  it('reads a Tokyo address as Tokyo, not as its ward', () => {
    expect(cityFromComponents([
      component('日本', 'country'),
      component('東京都', 'administrative_area_level_1'),
      component('台東区', 'locality'),
    ])).toBe('東京都');
  });

  it('does the same for a ward in the sublocality', () => {
    expect(cityFromComponents([
      component('東京都', 'administrative_area_level_1'),
      component('渋谷区', 'sublocality_level_1'),
    ])).toBe('東京都');
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

  it('reads a Korean address as the city, not the district', () => {
    expect(cityFromComponents([
      component('대한민국', 'country'),
      component('부산광역시', 'administrative_area_level_1'),
      component('해운대구', 'sublocality_level_1'),
    ])).toBe('부산광역시');
  });
});

/**
 * 「不要以區為單位，要是城市。日本。東京 這樣」.
 *
 * Measured against the live Places response, asked in zh-TW:
 *
 *   淺草寺    locality = Taito City   admin_1 = Tokyo
 *   札幌時計台 locality = Sapporo      admin_1 = Hokkaido
 *   大阪城    locality = Osaka        admin_1 = Osaka
 *
 * Tokyo's twenty-three special wards are municipalities in their own right, so
 * there the locality is the ward. Everywhere else it already is the city.
 */
describe('city level, not ward level', () => {
  it('reads a Tokyo ward as Tokyo', () => {
    expect(cityFromComponents([
      component('日本', 'country'),
      component('Tokyo', 'administrative_area_level_1'),
      component('Taito City', 'locality'),
      component('Asakusa', 'sublocality_level_2', 'sublocality'),
    ])).toBe('Tokyo');
  });

  it('reads Sapporo as Sapporo, not as Hokkaido or Chuo Ward', () => {
    expect(cityFromComponents([
      component('日本', 'country'),
      component('Hokkaido', 'administrative_area_level_1'),
      component('Sapporo', 'locality'),
      component('Chuo Ward', 'sublocality_level_1', 'sublocality'),
    ])).toBe('Sapporo');
  });

  it('reads Osaka as Osaka', () => {
    expect(cityFromComponents([
      component('Osaka', 'administrative_area_level_1'),
      component('Osaka', 'locality'),
      component('Chuo Ward', 'sublocality_level_1', 'sublocality'),
    ])).toBe('Osaka');
  });

  it('handles the Japanese spelling of the prefecture', () => {
    expect(cityFromComponents([
      component('東京都', 'administrative_area_level_1'),
      component('台東区', 'locality'),
    ])).toBe('東京都');
  });

  /** A beach belongs to its region when it belongs to no town. */
  it('falls back to the region for a place in no town', () => {
    expect(cityFromComponents([
      component('南韓', 'country'),
      component('Busan', 'administrative_area_level_1'),
    ])).toBe('Busan');
  });
});
