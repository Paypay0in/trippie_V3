/**
 * 「翻譯要做啊」 — the one gap left after a day of fixing wrong prices was that
 * a Chinese shopping list could not be priced in Japan at all.
 */
import { describe, expect, it } from 'vitest';
import { languageOf, localisedName, PRODUCT_NOUNS, splitNouns } from './productNouns';

describe('which language a country prices in', () => {
  it('knows the markets this app compares', () => {
    expect(languageOf('TW')).toBe('zh');
    expect(languageOf('jp')).toBe('ja');
    expect(languageOf('KR')).toBe('ko');
    expect(languageOf('HK')).toBe('zh');
    expect(languageOf('US')).toBe('en');
  });
});

describe('finding the category noun in a name', () => {
  it('separates what the thing is from which one it is', () => {
    expect(splitNouns('Muji 卸妝濕巾 12片裝')).toEqual({
      concepts: ['cleansing-sheet'],
      rest: 'Muji 12片裝',
    });
  });

  it('reads the Japanese spelling of the same thing', () => {
    expect(splitNouns('無印良品 クレンジングシート 12枚').concepts).toEqual(['cleansing-sheet']);
  });

  /*
    The reason the table is searched longest-first. 「マスク」 is 口罩 and sits
    inside 「ホットアイマスク」, which is a different shelf entirely.
  */
  it('prefers the longer noun to the one hiding inside it', () => {
    expect(splitNouns('めぐりズム ホットアイマスク').concepts).toEqual(['hot-eye-mask']);
    expect(splitNouns('ハンドクリーム 50g').concepts).toEqual(['hand-cream']);
    expect(splitNouns('超立体マスク 30枚').concepts).toEqual(['face-covering']);
  });

  it('says nothing about a name it does not recognise', () => {
    expect(splitNouns('SK-II Facial Treatment Essence')).toEqual({
      concepts: [],
      rest: 'SK-II Facial Treatment Essence',
    });
  });
});

describe('writing a name the way the destination writes it', () => {
  it('translates the noun and leaves the brand and size alone', () => {
    expect(localisedName('Muji 卸妝濕巾 12片裝', 'ja')).toBe('Muji クレンジングシート 12片裝');
    expect(localisedName('蒸氣眼罩', 'ja')).toBe('ホットアイマスク');
    expect(localisedName('資生堂 防曬乳 SPF50', 'ja')).toBe('資生堂 日焼け止め SPF50');
  });

  it('translates back the other way too', () => {
    expect(localisedName('クレンジングシート 12枚', 'zh')).toBe('卸妝濕巾 12枚');
  });

  /*
    A regression, found by the Founder the morning after this shipped.
    「潤唇精華油」 is listed under lip-oil beside 「唇油」, and asking for the
    Chinese of a Chinese name rewrote his own words into the table's shorter
    ones — 台灣's query became 「SHIRO 唇油」 and stopped finding a product it
    had been finding for days.
  */
  it('leaves a name already in that language alone', () => {
    expect(localisedName('潤唇精華油', 'zh')).toBeNull();
    expect(localisedName('SHIRO 潤唇精華油 柚子香', 'zh')).toBeNull();
    expect(localisedName('無印良品 クレンジングシート 12枚', 'ja')).toBeNull();
    expect(localisedName('Muji 卸妝濕巾', 'zh')).toBeNull();
    // 跨語言還是照翻。
    expect(localisedName('潤唇精華油', 'ja')).toBe('リップオイル');
  });

  /*
    `null`, not the name unchanged. The caller spends a search on the answer,
    and 「this is the Japanese for it」 is worth one where 「I had nothing to
    offer」 is not.
  */
  it('says null when it has nothing to offer', () => {
    expect(localisedName('SK-II 青春露', 'ja')).toBeNull();
    expect(localisedName('化粧水', 'ja')).toBeNull();
    // 韓文表還沒鋪滿；沒有的詞就誠實回報沒有。
    expect(localisedName('原子筆', 'ko')).toBeNull();
  });
});

describe('the table itself', () => {
  it('gives every noun an id used once', () => {
    const ids = PRODUCT_NOUNS.map(noun => noun.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every noun at least one spelling in both markets in play', () => {
    for (const noun of PRODUCT_NOUNS) {
      expect(noun.zh.length, noun.id).toBeGreaterThan(0);
      expect(noun.ja.length, noun.id).toBeGreaterThan(0);
    }
  });

  /* A one-character noun turns up inside unrelated names. */
  it('has no spelling short enough to match by accident', () => {
    for (const noun of PRODUCT_NOUNS) {
      for (const spelling of [...noun.zh, ...noun.ja, ...(noun.ko ?? []), ...(noun.en ?? [])]) {
        expect(spelling.length, `${noun.id}: ${spelling}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

/*
  無印's own Taiwanese shop writes 「攜帶用卸妝巾(大容量)/30張」, and the row says
  卸妝濕巾 — so the one shop certain to be selling it scored zero.
*/
describe('the spellings a shop actually uses', () => {
  it('knows 卸妝巾 is 卸妝濕巾', () => {
    expect(splitNouns('攜帶用卸妝巾(大容量)/30張').concepts).toEqual(['cleansing-sheet']);
    expect(splitNouns('無印良品 メイク落としシート').concepts).toEqual(['cleansing-sheet']);
  });
});
