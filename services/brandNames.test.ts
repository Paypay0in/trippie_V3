/**
 * 「安耐曬 防曬乳」 opened four Japanese pages and matched none. All four were
 * selling it; they write 「資生堂 アネッサ」. The brand is the same company in
 * every market and was the one word that did not match.
 */
import { describe, expect, it } from 'vitest';
import { BRAND_NAMES, brandEntry, localisedBrand, mentionsBrand, sameBrand } from './brandNames';

describe('the brand as that market writes it', () => {
  it('finds the row from any market’s spelling', () => {
    expect(brandEntry('ANESSA')?.ja).toBe('アネッサ');
    expect(brandEntry('アネッサ')?.zh).toBe('安耐曬');
    expect(brandEntry('安耐曬')?.en).toBe('ANESSA');
    expect(brandEntry('不存在的牌子')).toBeUndefined();
    expect(brandEntry('')).toBeUndefined();
  });

  it('writes it the destination’s way', () => {
    expect(localisedBrand('ANESSA', 'JP')).toBe('アネッサ');
    expect(localisedBrand('曼秀雷敦', 'JP')).toBe('メンソレータム');
    expect(localisedBrand('アネッサ', 'TW')).toBe('安耐曬');
  });

  /* Nothing to add is said as nothing, not as the brand unchanged. */
  it('says nothing where the markets agree', () => {
    expect(localisedBrand('ANESSA', 'US')).toBeUndefined();
    expect(localisedBrand('花王', 'JP')).toBeUndefined();
    expect(localisedBrand('SK-II', 'JP')).toBeUndefined();
    expect(localisedBrand('DHC', 'JP')).toBeUndefined();
  });

  it('knows two spellings are one company', () => {
    expect(sameBrand('ANESSA', 'アネッサ')).toBe(true);
    expect(sameBrand('曼秀雷敦', 'Mentholatum')).toBe(true);
    expect(sameBrand('ANESSA', 'キャンメイク')).toBe(false);
    expect(sameBrand('SK-II', 'sk ii')).toBe(true);
    expect(sameBrand('', 'ANESSA')).toBe(false);
  });

  it('finds a brand inside a page’s own title', () => {
    expect(mentionsBrand('資生堂 アネッサ パーフェクトUV 60ml', 'ANESSA')).toBe(true);
    expect(mentionsBrand('メンソレータム メルティクリームリップ 無香料', '曼秀雷敦')).toBe(true);
    expect(mentionsBrand('SK-II 青春露 230ml', 'SK-II')).toBe(true);
    expect(mentionsBrand('キャンメイク チーク', 'ANESSA')).toBe(false);
  });
});

describe('the table itself', () => {
  it('names each brand once', () => {
    const keys = BRAND_NAMES.map(entry => entry.en.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
