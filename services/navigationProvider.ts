/**
 * Which map app a destination should open in.
 *
 * 「South Korea → NAVER Map; preserve existing behavior outside South Korea」.
 *
 * Decided by where the place *is*, never by where the reader is. Somebody
 * planning a Seoul trip from their sofa in Taipei is looking at a Korean
 * place, and a provider chosen from GPS would hand them Google for a country
 * where Google Maps cannot route.
 *
 * Outside Korea nothing changes. That is not caution, it is the requirement:
 * every existing link keeps its exact output, and the tests pin them
 * character by character.
 */

import i18n from '../i18n/config';

/**
 * Apple Maps is deliberately absent.
 *
 * The ticket lists it for Taiwan, but this app has never built an Apple Maps
 * link anywhere, and adding one here would be a change to navigation outside
 * South Korea — the one thing this work was told not to touch. The type is
 * the shape of what Trippie can actually open today.
 */
export type NavigationProvider = 'naver' | 'google';

export interface ProviderInput {
  /** ISO 3166-1 alpha-2, as the places resolver now returns it. */
  countryCode?: string;
  /** The free-text country older saves carry, used only as a bridge. */
  country?: string;
  /** What the traveller picked by hand, which outranks everything. */
  userChoice?: NavigationProvider;
}

/**
 * Korea, written the ways this app has actually stored it.
 *
 * A country *code* is the real answer and the only one that scales — a name
 * list is a synonym table nobody finishes maintaining, and it is exactly what
 * this file should not become.
 *
 * It exists anyway, for one country, because every place saved before the
 * resolver started returning `countryCode` has only a name. Without this the
 * feature is invisible on every trip already in the app, which is every trip
 * the Founder would open to look at it.
 *
 * It stays Korea-only and exact-match-only. 「Korea」 alone is not here:
 * 「North Korea」 contains it, and a substring rule on country names is how a
 * list like this starts being wrong.
 */
const KOREA_NAMES = new Set([
  // i18n-data: stored country spellings this app matches against.
  '韓國', '韩国', '南韓', '대한민국', '한국',
  'south korea', 'korea, republic of', 'republic of korea',
]);

const isKorea = ({ countryCode, country }: ProviderInput): boolean => {
  const code = countryCode?.trim().toUpperCase();
  if (code) return code === 'KR';
  const name = country?.trim().toLowerCase();
  return Boolean(name) && KOREA_NAMES.has(name!);
};

/**
 * The provider for this destination.
 *
 * An explicit choice is returned untouched, including a choice of Google for
 * a Korean place: 「Do not override an explicit user selection」 means the
 * rule yields to the person, not the other way round.
 *
 * Anything we cannot place falls to Google — the behaviour that is already
 * there. Guessing NAVER for an unknown country would send somebody to a map
 * that works in one country, and being unsure is not a reason to change what
 * already works.
 */
export const navigationProviderFor = (input: ProviderInput = {}): NavigationProvider => {
  if (input.userChoice) return input.userChoice;
  return isKorea(input) ? 'naver' : 'google';
};

/**
 * The providers worth offering for this destination, best first.
 *
 * 「display only supported navigation options」. NAVER is listed only where it
 * works, because an option that opens a map with no data for the country is
 * not a choice, it is a trap with a familiar name on it.
 */
export const providersFor = (input: ProviderInput = {}): NavigationProvider[] =>
  isKorea(input) ? ['naver', 'google'] : ['google'];

export const PROVIDER_LABEL: Record<NavigationProvider, string> = {
  get naver() { return i18n.t('transport.provider.naver'); },
  get google() { return i18n.t('transport.provider.google'); },
};
