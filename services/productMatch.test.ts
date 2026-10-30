/**
 * Whether the thing a page sells is the thing on the list.
 *
 * Every case here is a real page from the Founder's own shopping list, named
 * with what that page actually calls its product.
 */
import { describe, expect, it } from 'vitest';
import { matchProduct, packSizeIn, sizesIn } from './productMatch';

describe('the two that were quoted wrongly', () => {
  /*
    shop.muji.tw/SalePage/Index/10910618 is titled 「米糠發酵導入美容液,50ml」
    and was quoted NT$490 as the price of a sheet mask.
  */
  it('refuses a serum when a sheet mask was asked for', () => {
    const match = matchProduct(
      { name: '米糠发酵修护舒缓湿敷面膜', brand: 'MUJI' },
      '米糠發酵導入美容液,50ml',
    );

    expect(match.confidence).toBe('none');
  });

  /*
    roomie.tw's article carried two Products; the reader took the first.
    乳木果油霜 is a shea butter cream and shares nothing with a lip oil.
  */
  it('refuses the other product on the same page', () => {
    expect(matchProduct({ name: '潤唇精華油', brand: 'SHIRO' }, '乳木果油霜').confidence)
      .toBe('none');
    expect(matchProduct({ name: '潤唇精華油', brand: 'SHIRO' }, 'SHIRO北海道純天然限定身體乳').confidence)
      .toBe('none');
  });

  /* And takes the one that is right, from the official store. */
  it('takes the product the official store names', () => {
    const match = matchProduct({ name: '潤唇精華油', brand: 'SHIRO' }, '潤唇精華油');

    expect(match.confidence).toBe('exact');
  });
});

describe('size', () => {
  it('reads a size only where a unit says so', () => {
    expect(sizesIn('8x4 ロールオン 45ml')).toEqual(['45ml']);
    expect(sizesIn('クレンジングシート 12枚')).toEqual(['12count']);
    expect(sizesIn('BCL 妝前乳 30g')).toEqual(['30g']);
    // 「4987188116012」 is a barcode; 「2026」 is a year.
    expect(sizesIn('ロキソプロフェン 4987188116012 2026')).toEqual([]);
  });

  /* 12枚 and 12片 are the same box counted in two scripts. */
  it('counts sheets and pieces as the same unit', () => {
    expect(sizesIn('12片裝')).toEqual(['12count']);
    expect(sizesIn('12枚')).toEqual(['12count']);
    expect(matchProduct(
      { name: 'クレンジングシート', spec: 'Muji · 12片裝' },
      'クレンジングシート 12枚',
    ).confidence).toBe('exact');
  });

  /*
    This used to be impossible and was tested as such: 「卸妝濕巾」 and
    「クレンジングシート」 are the same product and share not one character, so
    counted as characters they scored zero and a Japanese shop selling it was
    judged to be selling something else.

    `productNouns` is what closed it. The two names are no longer compared as
    characters at all — the category noun is taken out of each and compared as
    what it means, and only the brand, model and size are matched literally.
  */
  it('matches across scripts where the noun table knows the word', () => {
    expect(matchProduct({ name: '卸妝濕巾', brand: 'Muji' }, 'クレンジングシート 12枚').confidence)
      .not.toBe('none');
    expect(matchProduct({ name: '蒸氣眼罩' }, 'めぐりズム ホットアイマスク 12枚').confidence)
      .not.toBe('none');
  });

  /*
    And still refuses two different things, which is the point of translating
    the noun rather than ignoring it.
  */
  it('does not match two different nouns', () => {
    expect(matchProduct({ name: '卸妝濕巾', brand: 'Muji' }, 'シャンプー 600ml').confidence)
      .toBe('none');
    expect(matchProduct({ name: '面膜' }, '目薬 15ml').confidence).toBe('none');
  });

  it('refuses a different size of the same product', () => {
    const match = matchProduct(
      { name: '8x4 SARASARA SWITCH ロールオン', spec: '45ml' },
      '8x4 SARASARA SWITCH ロールオン 60ml',
    );

    expect(match.confidence).toBe('none');
    // The reason names both sizes, so the card can say which is which.
    expect(match.reasonKey).toBe('shopping.match.sizeDiffers');
    expect(match.reasonParams).toEqual({ wanted: '45ml', offered: '60ml' });
  });

  /* A page that states no size cannot contradict one. */
  it('does not refuse a page that is silent about size', () => {
    expect(matchProduct({ name: 'SK-II 青春露', spec: '230ml' }, 'SK-II 青春露').confidence)
      .toBe('exact');
  });
});

describe('what counts as the same name', () => {
  it('ignores packaging punctuation and width', () => {
    expect(matchProduct({ name: '雪肌精 化粧水' }, '【限定】雪肌精　化粧水（医薬部外品）').confidence)
      .toBe('exact');
  });

  it('matches a Latin name whatever its case', () => {
    expect(matchProduct(
      { name: 'SUBLIMIC AQUA INTENSIVE VELVET OIL', brand: 'SHISEIDO PROFESSIONAL' },
      'Shiseido Professional Sublimic Aqua Intensive Velvet Oil 100ml',
    ).confidence).toBe('exact');
  });

  /* A shop that names the brand but little else is a maybe, not a yes. */
  it('calls a partial name probable rather than exact', () => {
    const match = matchProduct(
      { name: 'ロキソプロフェンNaテープEX 7枚', brand: '久光製薬' },
      '久光製薬 ロキソプロフェンNaテープα 大判 7枚',
    );

    expect(match.confidence).toBe('probable');
  });

  it('says nothing is a match when the page names nothing', () => {
    expect(matchProduct({ name: '卸妝濕巾' }, '   ').confidence).toBe('none');
  });
});

/**
 * 「這個到底為何會給三個的價格」 — 爽快ドラッグ publishes 「45ml*3個セット」 at
 * ¥2,293, which is a true price for three bottles and three times the answer
 * to what the list is asking.
 */
describe('how many the listing sells at once', () => {
  it('reads a multipack the shop names', () => {
    expect(packSizeIn('エイトフォー ロールオン せっけん ( 45ml*3個セット )')).toBe(3);
    expect(packSizeIn('めぐりズム 2箱セット')).toBe(2);
    expect(packSizeIn('花王 ビオレ 3本セット')).toBe(3);
    expect(packSizeIn('資生堂 洗面乳 3入組')).toBe(3);
    expect(packSizeIn('DHC Lip Cream pack of 5')).toBe(5);
    expect(packSizeIn('DHC Lip Cream 5-pack')).toBe(5);
  });

  /*
    「12枚」 of cleansing sheets is one box of wipes and not twelve of
    anything. Reading that as a multipack would divide the price of half the
    drugstore.
  */
  it('is not fooled by the count inside a single product', () => {
    expect(packSizeIn('無印良品 クレンジングシート 12枚')).toBeNull();
    expect(packSizeIn('Muji 卸妝濕巾 12片裝')).toBeNull();
    expect(packSizeIn('8x4 SARASARA SWITCH ロールオン 45ml')).toBeNull();
    expect(packSizeIn('めぐりズム ホットアイマスク 1セット')).toBeNull();
    expect(packSizeIn('')).toBeNull();
  });
});
