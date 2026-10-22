/**
 * 「搜尋應該是要品牌名+商品名」.
 *
 * 卸妝濕巾 came back as a book from 博客來, because the lookup was handed the
 * row's whole note as its brand: 「Muji · 12片裝」. A size narrows a shelf and
 * widens a search — no shop writes 「12片裝」 in its title, so everything that
 * matched it matched on something else.
 */
import { describe, expect, it } from 'vitest';
import { brandOf, productQuery } from './productIdentity';

describe('the brand out of the note', () => {
  it('drops the size the note carries beside it', () => {
    expect(brandOf('Muji · 12片裝')).toBe('Muji');
    expect(brandOf('SK-II · 230ml')).toBe('SK-II');
  });

  /* Two words, one brand. The separator is the note's, never a space. */
  it('keeps a brand that is more than one word', () => {
    expect(brandOf('SHISEIDO PROFESSIONAL · DAMAGED HAIR')).toBe('SHISEIDO PROFESSIONAL');
    expect(brandOf('Jo Malone')).toBe('Jo Malone');
  });

  it('takes a note that is only a brand', () => {
    expect(brandOf('BCL')).toBe('BCL');
  });

  /* A sentence is a description. 「看評價很好用」 is not a company. */
  it('ignores a note that is prose', () => {
    expect(brandOf('聽說日本比較便宜，想買 2 瓶，而且可以順便逛一下其他的東西')).toBe('');
  });

  it('survives a row with no note at all', () => {
    expect(brandOf()).toBe('');
    expect(brandOf('')).toBe('');
    expect(brandOf('   ')).toBe('');
  });
});

describe('what gets searched for', () => {
  it('puts the brand in front of the name', () => {
    expect(productQuery('卸妝濕巾', 'Muji · 12片裝')).toBe('Muji 卸妝濕巾');
  });

  it('searches the name alone when nobody named a brand', () => {
    expect(productQuery('東京芭娜娜')).toBe('東京芭娜娜');
  });
});
