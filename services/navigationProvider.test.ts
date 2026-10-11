import { describe, expect, it } from 'vitest';
import { navigationProviderFor, providersFor } from './navigationProvider';

/**
 * 「South Korea → NAVER Map; preserve existing behavior outside South Korea」.
 *
 * Half of these are about *not* changing anything, because that is the
 * requirement that gets broken quietly: a provider rule that reaches one
 * country too far sends somebody in Tokyo to a map with no data for Japan.
 */

describe('choosing a map for a destination', () => {
  it('sends a Korean place to NAVER', () => {
    expect(navigationProviderFor({ countryCode: 'KR' })).toBe('naver');
  });

  it('does not care how the code was capitalised', () => {
    expect(navigationProviderFor({ countryCode: 'kr' })).toBe('naver');
  });

  it('leaves Japan exactly as it was', () => {
    expect(navigationProviderFor({ countryCode: 'JP' })).toBe('google');
  });

  it('leaves Taiwan exactly as it was', () => {
    expect(navigationProviderFor({ countryCode: 'TW' })).toBe('google');
  });

  /**
   * Being unsure is not a reason to change what already works. A place with
   * no country is every place saved before the resolver returned one.
   */
  it('falls to Google when the country is unknown', () => {
    expect(navigationProviderFor({})).toBe('google');
  });

  it('obeys a hand-picked provider, even against the rule', () => {
    expect(navigationProviderFor({ countryCode: 'KR', userChoice: 'google' })).toBe('google');
    expect(navigationProviderFor({ countryCode: 'JP', userChoice: 'naver' })).toBe('naver');
  });
});

describe('the bridge for places saved before country codes existed', () => {
  it('recognises the names this app has actually stored', () => {
    for (const name of ['韓國', '한국', '대한민국', 'South Korea', 'south korea']) {
      expect(navigationProviderFor({ country: name })).toBe('naver');
    }
  });

  /**
   * A substring rule on country names is how a list like this starts being
   * wrong, and 「North Korea」 is the first way it would.
   */
  it('does not match North Korea', () => {
    expect(navigationProviderFor({ country: 'North Korea' })).toBe('google');
  });

  it('does not match a country that merely mentions Korea', () => {
    expect(navigationProviderFor({ country: 'Korea Town, Los Angeles' })).toBe('google');
  });

  /** The code is the real answer; a stale name must not override it. */
  it('prefers the country code over the name', () => {
    expect(navigationProviderFor({ countryCode: 'JP', country: '韓國' })).toBe('google');
  });
});

describe('what to offer when the traveller wants to choose', () => {
  it('offers NAVER first in Korea', () => {
    expect(providersFor({ countryCode: 'KR' })).toEqual(['naver', 'google']);
  });

  /**
   * An option that opens a map with no data for the country is not a choice,
   * it is a trap with a familiar name on it.
   */
  it('does not offer NAVER anywhere else', () => {
    expect(providersFor({ countryCode: 'JP' })).toEqual(['google']);
    expect(providersFor({})).toEqual(['google']);
  });

  /**
   * Apple Maps is listed in the ticket for Taiwan, but this app has never
   * built an Apple link anywhere. Adding one would be a change to navigation
   * outside South Korea, which is the one thing this work must not do.
   */
  it('does not invent an Apple option this app cannot build', () => {
    expect(providersFor({ countryCode: 'TW' })).not.toContain('apple');
  });
});
