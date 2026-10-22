/**
 * Which two countries a shopping list compares.
 *
 * Destination against where the traveller lives, never against where their
 * passport was issued — the travel-rules research already refuses to conflate
 * those, and a price comparison that guessed wrong sends somebody home with a
 * suitcase of things that were cheaper at home.
 */
import { describe, expect, it } from 'vitest';
import { comparisonPair, countryCodeOf } from './shoppingComparison';
import { comparisonCountry, hostCountry, hostIsClaimed, COMPARISON_COUNTRIES } from './comparisonCountries';

describe('reading the trip’s country', () => {
  it('takes whatever spelling the trip used', () => {
    expect(countryCodeOf('日本')).toBe('JP');
    expect(countryCodeOf('Japan')).toBe('JP');
    expect(countryCodeOf('jp')).toBe('JP');
    expect(countryCodeOf('台灣')).toBe('TW');
  });

  it('says nothing for a country it cannot price in', () => {
    expect(countryCodeOf('義大利')).toBeUndefined();
    expect(countryCodeOf('')).toBeUndefined();
    expect(countryCodeOf()).toBeUndefined();
  });
});

describe('the pair', () => {
  it('compares the destination against where the traveller lives', () => {
    const pair = comparisonPair({ tripCountry: '日本', residenceCountryCode: 'TW' });

    expect(pair.destination?.code).toBe('JP');
    expect(pair.home?.code).toBe('TW');
    expect(pair.needsHome).toBe(false);
  });

  /* 「Allow a per-trip override.」 Korea against Canada, for this trip only. */
  it('lets the trip override where home is', () => {
    const pair = comparisonPair({
      tripCountry: '韓國',
      residenceCountryCode: 'TW',
      comparisonCountryCode: 'CA',
    });

    expect(pair.destination?.code).toBe('KR');
    expect(pair.home?.code).toBe('CA');
  });

  /*
    「If residence country is missing, ask the user to select one.」 Not
    defaulted to Taiwan: that is a decision nobody made, printed as a fact.
  */
  it('asks rather than guessing when nobody said where they live', () => {
    const pair = comparisonPair({ tripCountry: '日本' });

    expect(pair.home).toBeUndefined();
    expect(pair.needsHome).toBe(true);
  });

  /* A country compared with itself answers nothing. */
  it('refuses a pair that is one country twice', () => {
    const pair = comparisonPair({ tripCountry: '台灣', residenceCountryCode: 'TW' });

    expect(pair.home).toBeUndefined();
    expect(pair.needsHome).toBe(true);
  });

  it('still names the destination when home is missing', () => {
    expect(comparisonPair({ tripCountry: '日本' }).destination?.code).toBe('JP');
  });
});

describe('placing a shop', () => {
  const tw = comparisonCountry('TW')!;
  const jp = comparisonCountry('JP')!;
  const cn = comparisonCountry('CN')!;

  it('places a shop in one of the two countries in play', () => {
    expect(hostCountry('shop.muji.tw', [jp, tw])?.code).toBe('TW');
    expect(hostCountry('www.matsukiyo.co.jp', [jp, tw])?.code).toBe('JP');
  });

  /*
    淘寶's ¥14 printed as TWD 14 is why this exists — but the reason is that
    China was not one of the two countries, not that it was China. A
    traveller comparing 中國 with 加拿大 needs 淘寶.
  */
  it('leaves out a shop from a country nobody is comparing', () => {
    expect(hostCountry('au.world.taobao.com', [jp, tw])).toBeUndefined();
    expect(hostCountry('au.world.taobao.com', [cn, tw])?.code).toBe('CN');
  });

  /*
    A host nobody claims may still be placed by an unmistakable mark; one
    claimed by a country that is out of play has been identified, and no mark
    should override that.
  */
  it('tells an unclaimed host apart from an excluded one', () => {
    expect(hostIsClaimed('www.muji.com.cn')).toBe(true);
    expect(hostIsClaimed('glamoroushairbeauty.store')).toBe(false);
  });

  it('gives every country a currency and a way to ask for a price', () => {
    COMPARISON_COUNTRIES.forEach(entry => {
      expect(entry.currency).toMatch(/^[A-Z]{3}$/);
      expect(entry.priceWords.trim().length).toBeGreaterThan(0);
      expect(entry.displayName.trim().length).toBeGreaterThan(0);
    });
  });
});
