/**
 * 「價格的部分 不能也用brave搜尋嗎」 — a price read out of a search snippet.
 *
 * The thing being defended against is a number that is not money. A product
 * snippet is full of them: 50ml, 30g, 4.6 stars, 1,284 reviews, all sitting
 * exactly where a price would sit.
 */
import { describe, expect, it } from 'vitest';
import { looksLikeAProductPage, priceQuery, quotesFromSearch, readMoney, searchPrices } from './priceFromSearch';

const web = (results: Array<Record<string, unknown>>) => ({ web: { results } });

describe('reading money out of a snippet', () => {
  it('reads yen written in front', () => {
    expect(readMoney('ANESSA 日焼け止め ¥3,080 送料無料')).toEqual({ amount: 3080, currency: 'JPY' });
  });

  it('reads yen written behind', () => {
    expect(readMoney('資生堂 アネッサ 3,080円（税込）')).toEqual({ amount: 3080, currency: 'JPY' });
  });

  it('reads New Taiwan dollars', () => {
    expect(readMoney('SK-II 青春露 NT$5,200 屈臣氏')).toEqual({ amount: 5200, currency: 'TWD' });
  });

  it('reads 元', () => {
    expect(readMoney('康是美 特價 520 元')).toEqual({ amount: 520, currency: 'TWD' });
  });

  /*
    The whole reason the currency mark is required. 「50ml」 and 「4.6」 are
    numbers beside the product name, in the place a price goes.
  */
  it('refuses a number with no currency on it', () => {
    expect(readMoney('ANESSA 日焼け止め 60ml 評價 4.6 星 共 1,284 則')).toBeNull();
  });
});

describe('which region a quote belongs to', () => {
  it('files a .jp shop under 日本', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://www.matsukiyo.co.jp/store/p/1', title: 'アネッサ', description: '3,080円' },
    ]));

    expect(quotes[0].region).toBe('日本');
    expect(quotes[0].shop).toBe('matsukiyo.co.jp');
  });

  it('files a .tw shop under 台灣', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://shopee.tw/product/1', title: 'SK-II', description: 'NT$5,200' },
    ]));

    expect(quotes[0].region).toBe('台灣');
  });

  /* A yen price on a host that says nothing is still a Japanese price. */
  it('falls back to the currency when the host says nothing', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://example.com/p/1', title: 'アネッサ', description: '3,080円' },
    ]));

    expect(quotes[0].region).toBe('日本');
  });

  it('keeps only the region that was asked for', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II', description: 'NT$5,200' },
      { url: 'https://www.matsukiyo.co.jp/p/1', title: 'SK-II', description: '3,080円' },
    ]), '日本');

    expect(quotes).toHaveLength(1);
    expect(quotes[0].region).toBe('日本');
  });
});

describe('what is thrown away', () => {
  /* A quote nobody can open is a remembered price wearing the same clothes. */
  it('drops a result with no https page behind it', () => {
    expect(quotesFromSearch(web([
      { url: 'http://shopee.tw/p/1', title: 'SK-II', description: 'NT$5,200' },
    ]))).toEqual([]);
  });

  it('drops a result with no price in it at all', () => {
    expect(quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II 青春露', description: '正品保證 滿額免運' },
    ]))).toEqual([]);
  });

  /*
    A figure outside what the thing could cost came from a snippet describing
    something else — a total, a shipping threshold, a year.
  */
  it('drops a figure nothing on a shopping list costs', () => {
    expect(quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II', description: '累積銷售 NT$98,000,000' },
    ]))).toEqual([]);
  });

  /* Two listings from one shop is a shop disagreeing with itself. */
  it('keeps one quote per shop', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II', description: 'NT$5,200' },
      { url: 'https://shopee.tw/p/2', title: 'SK-II', description: 'NT$4,900' },
    ]));

    expect(quotes).toHaveLength(1);
  });

  it('survives a shape it does not recognise', () => {
    expect(quotesFromSearch({ nothing: true })).toEqual([]);
    expect(quotesFromSearch(null)).toEqual([]);
  });

  /* Brave marks the matched words, and the tags would split a 「1,480円」. */
  it('reads through the highlighting', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://www.matsukiyo.co.jp/p/1', title: 'アネッサ', description: '<strong>3,080</strong>円' },
    ]));

    expect(quotes[0].amount).toBe(3080);
  });
});

describe('what is asked', () => {
  it('asks each region in the language its shops price in', () => {
    expect(priceQuery('青春露', 'SK-II', '日本')).toBe('SK-II 青春露 価格 通販');
    expect(priceQuery('青春露', 'SK-II', '台灣')).toBe('SK-II 青春露 價格 購買');
  });

  it('asks nothing for a product with no name', () => {
    expect(priceQuery('  ', undefined, '台灣')).toBe('');
  });

  it('sends the key as a header and never in the query', async () => {
    let seen = '';
    let headers: Record<string, string> = {};
    await searchPrices({
      name: '青春露',
      region: '台灣',
      apiKey: 'secret-key',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = String(url);
        headers = init.headers as Record<string, string>;
        return { ok: true, json: async () => web([]) };
      }) as unknown as typeof fetch,
    });

    expect(seen).not.toContain('secret-key');
    expect(headers['X-Subscription-Token']).toBe('secret-key');
  });

  /* A quota refusal is not 「this costs nothing」; it has to reach the caller. */
  it('throws with the status when the search refuses', async () => {
    await expect(searchPrices({
      name: '青春露',
      region: '台灣',
      apiKey: 'k',
      fetchImpl: (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch,
    })).rejects.toMatchObject({ status: 429 });
  });
});

/**
 * Only a page that is about one product prices that product.
 *
 * Measured against the live search on 2026-10-22 with five real rows off the
 * Founder's list: every wrong quote came from a comparison site or from a
 * brand front page / category index, where the number in the snippet belongs
 * to whatever else was on it.
 */
describe('which pages are allowed to quote', () => {
  it('takes a product page', () => {
    expect(looksLikeAProductPage('https://shop.muji.tw/SalePage/Index/8920730')).toBe(true);
    expect(looksLikeAProductPage('https://tw.bid.yahoo.com/item/100269476721')).toBe(true);
  });

  /* NT$172 for KUMARGIC EYE, which is the cheapest of something else. */
  it('refuses a price-comparison site', () => {
    expect(looksLikeAProductPage('https://biggo.com.tw/s/Kumargic+EYE/')).toBe(false);
    expect(looksLikeAProductPage('https://www.findprice.com.tw/g/sk-ii')).toBe(false);
  });

  /* ¥98,200 for 青春露, off a duty-free shop's brand index. */
  it('refuses a listing', () => {
    expect(looksLikeAProductPage('https://duty-free-japan.jp/narita/ta/goodsList.aspx?brdCD=219')).toBe(false);
    expect(looksLikeAProductPage('https://www.bcl-brand.jp/shop/default.aspx')).toBe(false);
  });

  /* ¥2,000 for 青春露, off a department store's campaign landing page. */
  it('refuses a shop landing page and a campaign link', () => {
    expect(looksLikeAProductPage('https://web.hh-online.jp/hankyu-beauty/shop/?cid=bbs_pski')).toBe(false);
    expect(looksLikeAProductPage('https://example.com/brand/shop/')).toBe(false);
  });

  it('refuses a front page and somebody else’s search', () => {
    expect(looksLikeAProductPage('https://example.com/')).toBe(false);
    expect(looksLikeAProductPage('https://example.com/p?q=sk-ii')).toBe(false);
  });

  it('keeps them out of the quotes', () => {
    expect(quotesFromSearch(web([
      { url: 'https://biggo.com.tw/s/Kumargic+EYE/', title: 'KUMARGIC', description: 'NT$172' },
      { url: 'https://tw.bid.yahoo.com/item/100269476721', title: 'KUMARGIC', description: 'NT$699' },
    ]))).toEqual([{
      region: '台灣', shop: 'tw.bid.yahoo.com', amount: 699, currency: 'TWD',
      sourceUrl: 'https://tw.bid.yahoo.com/item/100269476721',
    }]);
  });
});
