import { describe, expect, it } from 'vitest';
import i18next from 'i18next';

import { getDestinationTips } from './destinationTips';
import en from '../i18n/locales/en.json';
import zhHant from '../i18n/locales/zh-Hant.json';

/**
 * The table holds keys now, so a test that reads `tip.title` would pass on a
 * key that resolves to nothing. These resolve through the real bundles in both
 * languages instead: that is the only assertion that still means what the old
 * one meant — the traveller reads a sentence, not a key.
 */
const resolver = (language: 'zh-Hant' | 'en') => {
  const instance = i18next.createInstance();
  instance.init({
    lng: language,
    resources: { 'zh-Hant': { translation: zhHant }, en: { translation: en } },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
  return instance;
};

const LANGUAGES = ['zh-Hant', 'en'] as const;

describe('destination tips', () => {
  it('gives Korea the map-app warning travellers actually need', () => {
    const tips = getDestinationTips('韓國');
    LANGUAGES.forEach(language => {
      const t = resolver(language);
      expect(tips.some(tip => t.t(tip.titleKey).includes('Naver'))).toBe(true);
    });
  });

  /*
    Every key in the table resolves. A missing one used to be invisible: the
    screen showed the Chinese because the table held it, so a typo in a key
    could only be found by looking at the screen in English.
  */
  it('resolves every key it hands the screen, in both languages', () => {
    const countries = ['韓國', '日本', '泰國', '越南', '新加坡', '香港', '中國', '美國'];
    LANGUAGES.forEach(language => {
      const t = resolver(language);
      countries.flatMap(getDestinationTips).forEach(tip => {
        [tip.titleKey, tip.detailKey, tip.link?.labelKey].forEach(key => {
          if (!key) return;
          expect(t.exists(key), `${language} missing ${key}`).toBe(true);
          expect(t.t(key)).not.toBe(key);
        });
      });
    });
  });

  /*
    The country keys and the aliases are stored values matched against the
    traveller's own country, not copy. Translating them would orphan trips that
    already name a country, so they stay Chinese for good.
  */
  it('accepts the names people actually type for a country', () => {
    expect(getDestinationTips('南韓')).toEqual(getDestinationTips('韓國'));
    expect(getDestinationTips('  韓國  ')).toEqual(getDestinationTips('韓國'));
  });

  it('still matches the stored country name when the app is in English', () => {
    const t = resolver('en');
    const tips = getDestinationTips('日本');
    expect(tips.length).toBeGreaterThan(0);
    expect(t.t(tips[0].titleKey)).not.toMatch(/[一-鿿]/);
  });

  it('returns nothing rather than filler for a country with no entry', () => {
    // An empty section is honest; invented advice about a real place is not.
    expect(getDestinationTips('冰島')).toEqual([]);
    expect(getDestinationTips('')).toEqual([]);
    expect(getDestinationTips(undefined)).toEqual([]);
  });
});
