/**
 * Passports the app can name.
 *
 * The same list the identity sheet offers, extracted so the overview's picker
 * cannot drift from it: two lists of passports that disagree would give a
 * traveller entry rules for a country code the other screen never heard of.
 *
 * Every row is DATA, which is why each one carries a marker. `displayName` is
 * written straight into the profile — `App.handleSelectPassportCountry` stores
 * it as `PassportProfile.country`, and the profile is persisted under
 * `trippie_profile` and read back by the entry-rules lookup, so a translated
 * spelling orphans a passport somebody already saved. `passportLabel` is the
 * same identity in the same row and is the only thing the picker shows;
 * localising half a row would let the two drift, which is the drift this file
 * exists to prevent. Country names are matching keys throughout this repo —
 * see `countryIdentity.ts` and `cityNames.ts`.
 */

export interface PassportOption {
  countryCode: string;
  /** The country as people say it, e.g. 台灣. */
  displayName: string;
  /** The passport as people say it, e.g. 台灣護照. */
  passportLabel: string;
}

export const PASSPORT_OPTIONS: PassportOption[] = [
  // i18n-data: stored passport identity, see above
  ['TW', '台灣', '台灣護照'],
  // i18n-data: stored passport identity, see above
  ['JP', '日本', '日本護照'],
  // i18n-data: stored passport identity, see above
  ['KR', '韓國', '韓國護照'],
  // i18n-data: stored passport identity, see above
  ['HK', '香港', '香港特別行政區護照'],
  // i18n-data: stored passport identity, see above
  ['MO', '澳門', '澳門特別行政區護照'],
  // i18n-data: stored passport identity, see above
  ['CN', '中國', '中華人民共和國護照'],
  // i18n-data: stored passport identity, see above
  ['SG', '新加坡', '新加坡護照'],
  // i18n-data: stored passport identity, see above
  ['MY', '馬來西亞', '馬來西亞護照'],
  // i18n-data: stored passport identity, see above
  ['TH', '泰國', '泰國護照'],
  // i18n-data: stored passport identity, see above
  ['VN', '越南', '越南護照'],
  // i18n-data: stored passport identity, see above
  ['PH', '菲律賓', '菲律賓護照'],
  // i18n-data: stored passport identity, see above
  ['ID', '印尼', '印尼護照'],
  // i18n-data: stored passport identity, see above
  ['CA', '加拿大', '加拿大護照'],
  // i18n-data: stored passport identity, see above
  ['US', '美國', '美國護照'],
  // i18n-data: stored passport identity, see above
  ['GB', '英國', '英國護照'],
  // i18n-data: stored passport identity, see above
  ['FR', '法國', '法國護照'],
  // i18n-data: stored passport identity, see above
  ['DE', '德國', '德國護照'],
  // i18n-data: stored passport identity, see above
  ['IT', '義大利', '義大利護照'],
  // i18n-data: stored passport identity, see above
  ['ES', '西班牙', '西班牙護照'],
  // i18n-data: stored passport identity, see above
  ['AU', '澳洲', '澳洲護照'],
  // i18n-data: stored passport identity, see above
  ['NZ', '紐西蘭', '紐西蘭護照'],
].map(([countryCode, displayName, passportLabel]) => ({
  countryCode,
  displayName,
  passportLabel,
}));
