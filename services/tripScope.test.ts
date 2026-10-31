import { describe, expect, it } from 'vitest';
import {
  deriveTripScope,
  effectiveTripScope,
  popularDestinations,
  suggestedCurrency,
} from './tripScope';

describe('deriveTripScope', () => {
  it('calls a trip inside the residence country domestic, however each side is spelled', () => {
    expect(deriveTripScope('TW', '台灣')).toBe('domestic');
    expect(deriveTripScope('台灣', 'Taiwan')).toBe('domestic');
    expect(deriveTripScope('US', 'USA')).toBe('domestic');
  });

  it('calls a trip to another country international', () => {
    expect(deriveTripScope('TW', '日本')).toBe('international');
    expect(deriveTripScope('JP', 'Taiwan')).toBe('international');
  });

  /*
    The case the whole feature stands on. Residence is asked for and never
    inferred, so most travellers have none today — and 「unknown」 must stay
    unknown rather than becoming 國外, which is a guess that looks like an
    answer and quietly hides nothing while claiming to have decided.
  */
  it('answers unknown when either side is missing, never a default', () => {
    expect(deriveTripScope(undefined, '日本')).toBe('unknown');
    expect(deriveTripScope('TW', undefined)).toBe('unknown');
    expect(deriveTripScope('  ', '  ')).toBe('unknown');
  });
});

describe('effectiveTripScope', () => {
  it('prefers what the traveller chose over what the countries imply', () => {
    expect(effectiveTripScope('domestic', 'TW', '日本')).toBe('domestic');
    expect(effectiveTripScope('international', 'TW', '台灣')).toBe('international');
  });

  it('falls back to the derivation when nothing was stored', () => {
    expect(effectiveTripScope(undefined, 'TW', '台灣')).toBe('domestic');
    expect(effectiveTripScope(undefined, undefined, '台灣')).toBe('unknown');
  });
});

describe('suggestedCurrency', () => {
  it('suggests the country currency for the places this app knows', () => {
    expect(suggestedCurrency('台灣')).toBe('TWD');
    expect(suggestedCurrency('JP')).toBe('JPY');
    expect(suggestedCurrency('USA')).toBe('USD');
    expect(suggestedCurrency('France')).toBe('EUR');
  });

  it('suggests nothing for a country it does not know, rather than guessing TWD', () => {
    expect(suggestedCurrency('Lagos')).toBeUndefined();
    expect(suggestedCurrency(undefined)).toBeUndefined();
  });
});

describe('popularDestinations', () => {
  it('offers places inside the residence country for a domestic trip', () => {
    expect(popularDestinations('domestic', 'US').map(place => place.city)).toEqual([
      'New York',
      'Seattle',
      'Chicago',
      'Boston',
    ]);
    expect(popularDestinations('domestic', '台灣').map(place => place.city)).toContain('台南');
  });

  it('offers no domestic shortcuts when nobody said where the traveller lives', () => {
    expect(popularDestinations('domestic', undefined)).toEqual([]);
    expect(popularDestinations('domestic', 'Iceland')).toEqual([]);
  });

  /* 「國外」 shortcuts that are in fact home are not abroad. */
  it('drops the residence country from the international shortcuts', () => {
    const countries = popularDestinations('international', '日本').map(place => place.country);
    expect(countries).not.toContain('日本');
    expect(countries).toContain('韓國');
  });
});
