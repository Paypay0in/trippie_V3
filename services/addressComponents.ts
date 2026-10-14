/**
 * The town an address component list names.
 *
 * 「筆記我希望以國家。城市 為單位」 — and every saved note was filed under its
 * country, because the city written onto a save came from the trip's own
 * destination field. On a trip created from a boarding pass that field holds
 * what destination detection wrote, which for a Japan trip was 「日本」, so the
 * city and the country were the same word and every note in the country
 * collapsed into one card.
 *
 * Google has been sending the answer the whole time: `addressComponents` has
 * been in both place field masks for as long as they have existed, and only
 * the country was ever read out of them.
 *
 * Tried widest-useful first. A ward or district says more to somebody standing
 * in Tokyo than 「東京都」 does, and the prefecture is the last resort for a
 * place in no town at all.
 */

export interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

const CITY_TYPES = [
  'locality',
  'sublocality_level_1',
  'sublocality',
  'administrative_area_level_2',
  'administrative_area_level_1',
];

export const cityFromComponents = (components?: AddressComponent[]): string | undefined =>
  CITY_TYPES
    .map(type => components?.find(component => component.types?.includes(type))?.longText)
    .find(Boolean);
