import { describe, expect, it } from 'vitest';
import i18next from 'i18next';

import { powerAdviceLines, powerHeadline, powerProfileFor } from './powerAndPlugs';
import { interpolationFor } from './localeList';
import en from '../i18n/locales/en.json';
import zhHant from '../i18n/locales/zh-Hant.json';

/*
  The module holds keys and a plug array now, so these resolve through the real
  bundles. The assertions are the same claims as before — the socket shapes are
  named, the appliance split survives, no country the traveller did not name is
  mentioned — only now they are checked on the sentence a reader of either
  language actually gets.
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

const sentences = (country: string, language: 'zh-Hant' | 'en'): string[] => {
  const t = resolver(language);
  const translate = (key: string) => t.t(key);
  return powerAdviceLines(powerProfileFor(country)!)
    .map(line => t.t(line.key, interpolationFor(line.params, translate)));
};

/**
 * 「每個國家在行前 都要提醒電壓跟插座這件事」, and then 「我目前設定是持有中國護照
 * 因此這邊寫台灣很奇怪！…只顯示旅遊目的地的！」.
 */
describe('powerProfileFor', () => {
  it('knows Korea', () => {
    expect(powerProfileFor('韓國')).toMatchObject({ voltage: 220, frequency: 60, plugs: ['C', 'F'] });
  });

  it('knows Mexico', () => {
    expect(powerProfileFor('墨西哥')).toMatchObject({ voltage: 127, plugs: ['A', 'B'] });
  });

  /* 「Japan」 and 「日本」 are the same country. See `countryIdentity`. */
  it('answers the same for either spelling', () => {
    expect(powerProfileFor('Japan')).toEqual(powerProfileFor('日本'));
  });

  it('says nothing about a country it has never heard of', () => {
    expect(powerProfileFor('瓦干達')).toBeUndefined();
    expect(powerProfileFor('')).toBeUndefined();
  });
});

describe('what it says on the screen', () => {
  it('leads with the voltage and the frequency', () => {
    expect(powerHeadline(powerProfileFor('墨西哥')!)).toBe('127V · 60Hz');
  });

  it('names the socket shapes, joined the way the language joins a list', () => {
    expect(sentences('韓國', 'zh-Hant')[0]).toContain('C、F');
    expect(sentences('韓國', 'en')[0]).toContain('C, F');
  });

  /*
    The appliance split is the useful part and it survives having no home
    country, because it is a fact about the appliance rather than about the
    traveller.
  */
  it('separates what copes with any voltage from what does not', () => {
    expect(sentences('韓國', 'zh-Hant')[1]).toContain('100–240V');
    expect(sentences('韓國', 'zh-Hant')[1]).toContain('吹風機');
    expect(sentences('韓國', 'en')[1]).toContain('100–240V');
    expect(sentences('韓國', 'en')[1]).toContain('hairdryer');
  });

  /* The voltage is interpolated twice in one sentence; both must be the real one. */
  it('states the destination voltage, not a placeholder', () => {
    expect(sentences('墨西哥', 'en')[1]).not.toContain('{{');
    expect(sentences('墨西哥', 'en')[1].match(/127V/g)?.length).toBe(2);
  });

  /*
    Nothing in here compares the destination to anywhere else. The first
    version hardcoded 台灣 as home, which is a guess about the reader — and the
    reader who found it was travelling on a Chinese passport.
  */
  it('never mentions a country the traveller did not name', () => {
    (['zh-Hant', 'en'] as const).forEach(language => {
      const said = sentences('墨西哥', language).join(' ');
      expect(said).not.toContain('台灣');
      expect(said).not.toContain('台規');
      expect(said).not.toContain('Taiwan');
    });
  });

  it('carries the country\'s own caveat', () => {
    expect(sentences('巴西', 'zh-Hant').join('')).toContain('127V 與 220V 並存');
    expect(sentences('巴西', 'en').join('')).toContain('127V and 220V side by side');
  });

  /* A note is a key now; one that does not resolve would show as a raw key. */
  it('resolves every note it carries, in both languages', () => {
    (['日本', '瑞士', '巴西'] as const).forEach(country => {
      (['zh-Hant', 'en'] as const).forEach(language => {
        const said = sentences(country, language);
        expect(said).toHaveLength(3);
        expect(said[2]).not.toMatch(/^plan\./);
      });
    });
  });

  /* 「回台灣不要出現」 is gone with the comparison: a trip home has a voltage too. */
  it('answers for a destination even when it is where somebody lives', () => {
    expect(powerProfileFor('台灣')).toMatchObject({ voltage: 110, plugs: ['A', 'B'] });
  });
});
