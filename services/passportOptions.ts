/**
 * Passports the app can name.
 *
 * The same list the identity sheet offers, extracted so the overview's picker
 * cannot drift from it: two lists of passports that disagree would give a
 * traveller entry rules for a country code the other screen never heard of.
 */

export interface PassportOption {
  countryCode: string;
  /** The country as people say it, e.g. 台灣. */
  displayName: string;
  /** The passport as people say it, e.g. 台灣護照. */
  passportLabel: string;
}

export const PASSPORT_OPTIONS: PassportOption[] = [
  ['TW', '台灣', '台灣護照'],
  ['JP', '日本', '日本護照'],
  ['KR', '韓國', '韓國護照'],
  ['HK', '香港', '香港特別行政區護照'],
  ['MO', '澳門', '澳門特別行政區護照'],
  ['CN', '中國', '中華人民共和國護照'],
  ['SG', '新加坡', '新加坡護照'],
  ['MY', '馬來西亞', '馬來西亞護照'],
  ['TH', '泰國', '泰國護照'],
  ['VN', '越南', '越南護照'],
  ['PH', '菲律賓', '菲律賓護照'],
  ['ID', '印尼', '印尼護照'],
  ['CA', '加拿大', '加拿大護照'],
  ['US', '美國', '美國護照'],
  ['GB', '英國', '英國護照'],
  ['FR', '法國', '法國護照'],
  ['DE', '德國', '德國護照'],
  ['IT', '義大利', '義大利護照'],
  ['ES', '西班牙', '西班牙護照'],
  ['AU', '澳洲', '澳洲護照'],
  ['NZ', '紐西蘭', '紐西蘭護照'],
].map(([countryCode, displayName, passportLabel]) => ({
  countryCode,
  displayName,
  passportLabel,
}));
