/**
 * 「這個點進去明顯是錯誤」.
 *
 * `roomie.tw/posts/157366` was quoted as a Taiwanese price of NT$389, and it
 * passed every check: the address says Taiwan, the page opened, and the page
 * published a `Product` with a price. It is an article, and the 389 belongs
 * to something else mentioned in it.
 */
import { describe, expect, it } from 'vitest';
import { looksEditorial, looksLikeAListingTitle, looksSecondHand } from './merchantPages';

describe('writing about a thing, or selling it', () => {
  it('knows the article the Founder clicked', () => {
    expect(looksEditorial('https://www.roomie.tw/posts/157366')).toBe(true);
  });

  it('knows a shop selling the same product', () => {
    expect(looksEditorial('https://shiro-shiro.tw/products/essence-lip_1')).toBe(false);
    expect(looksEditorial('https://shop.muji.tw/SalePage/Index/8920730')).toBe(false);
    expect(looksEditorial('https://store.shopping.yahoo.co.jp/kirindo/4987188116036.html')).toBe(false);
  });

  /* The shape is the same whatever language the publisher writes in. */
  it('reads the path as well as the host', () => {
    expect(looksEditorial('https://example.com/blog/best-sunscreen-2026')).toBe(true);
    expect(looksEditorial('https://example.com/news/12345')).toBe(true);
    expect(looksEditorial('https://example.com/review/anessa')).toBe(true);
    expect(looksEditorial('https://example.com/article/anessa')).toBe(true);
  });

  /*
    A shop whose products live under a path that merely contains one of those
    words is not an article: the segment has to be the segment.
  */
  it('does not mistake a product path for an article', () => {
    expect(looksEditorial('https://example.com/products/newsstand-mug')).toBe(false);
    expect(looksEditorial('https://example.com/item/storybook-lamp')).toBe(false);
  });

  it('survives something that is not a URL', () => {
    expect(looksEditorial('not a url')).toBe(false);
    expect(looksEditorial('')).toBe(false);
  });
});

/**
 * 「請擋二手」 — mercari quoted ¥300 for 無印's cleansing sheets, several times
 * under the shop price. A real product page, a real price, the right product,
 * and not an answer to 「how much will this cost me in Japan」: one item, sold
 * once, at whatever one stranger wanted for it.
 */
describe('a flea market is not a shop', () => {
  it('refuses the platforms where used is the normal listing', () => {
    expect(looksSecondHand('https://jp.mercari.com/item/m78015729978')).toBe(true);
    expect(looksSecondHand('https://auctions.yahoo.co.jp/jp/auction/x1234')).toBe(true);
    expect(looksSecondHand('https://paypayfleamarket.yahoo.co.jp/item/z999')).toBe(true);
    expect(looksSecondHand('https://www.2ndstreet.jp/goods/detail/1')).toBe(true);
    expect(looksSecondHand('https://www.ebay.com/itm/123')).toBe(true);
  });

  /*
    And only those. 露天 and 蝦皮 are full of small shops selling new stock;
    refusing every site an individual can list on would cost far more real
    prices than it saves.
  */
  it('leaves the ordinary shops alone', () => {
    expect(looksSecondHand('https://shop.muji.tw/SalePage/Index/8920730')).toBe(false);
    expect(looksSecondHand('https://store.shopping.yahoo.co.jp/dhc/8000000013.html')).toBe(false);
    expect(looksSecondHand('https://www.ruten.com.tw/item/show?22401')).toBe(false);
    expect(looksSecondHand('https://shopee.tw/product/1/2')).toBe(false);
    expect(looksSecondHand('https://item.rakuten.co.jp/shop/abc/')).toBe(false);
  });

  it('survives something that is not a url', () => {
    expect(looksSecondHand('not a url')).toBe(false);
    expect(looksSecondHand('')).toBe(false);
  });
});

/**
 * A listing says so in its own title.
 *
 * Both of these were read as prices once the page reader started reading what
 * a page writes for people: ¥1,496 off 「メーカー別-サ行-資生堂-アネッサ -
 * 1ページ目」, and ¥666 off 「よりどり割(並び順：価格(安い順))」 for a box of eye
 * masks that costs ¥1,620 — the cheapest thing on a page sorted by cheapest,
 * which is the comparison-site defect arriving through a new door.
 */
describe('a page that lists things says so', () => {
  it('recognises the titles that produced wrong figures', () => {
    expect(looksLikeAListingTitle('メーカー別-サ行-資生堂-アネッサ - 1ページ目')).toBe(true);
    expect(looksLikeAListingTitle('「花王 めぐりズム 蒸気でホットアイマスク」よりどり割(並び順：価格(安い順))')).toBe(true);
    expect(looksLikeAListingTitle('曼秀雷敦 商品一覧')).toBe(true);
    expect(looksLikeAListingTitle('ANESSA 搜尋結果')).toBe(true);
    /*
      「〜の通販」 is 「mail-order of X」 — a shelf, not a thing. 高島屋's
      「CHANEL（シャネル） リップカラーの通販」 handed over ¥4,950 for a row that
      says 唇霜, and リップカラー is lip colour.
    */
    expect(looksLikeAListingTitle('CHANEL（シャネル） リップカラーの通販 | TBEAUT - 高島屋')).toBe(true);
  });

  it('leaves an actual product title alone', () => {
    expect(looksLikeAListingTitle('メンソレータム メルティクリームリップ 無香料 ( 2.4g )')).toBe(false);
    expect(looksLikeAListingTitle('SK-II 青春露 230ml')).toBe(false);
    expect(looksLikeAListingTitle('')).toBe(false);
  });
});
