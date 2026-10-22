/**
 * 「價格的部分 不能也用brave搜尋嗎」 — a price read out of a search snippet.
 *
 * The thing being defended against is a number that is not money. A product
 * snippet is full of them: 50ml, 30g, 4.6 stars, 1,284 reviews, all sitting
 * exactly where a price would sit.
 */
import { describe, expect, it } from 'vitest';
import { candidatesFromSearch, looksLikeAProductPage, placeOf, priceQueries, priceQuery, quotesFromSearch, readMoney, relaxedName, searchCandidates, searchPrices } from './priceFromSearch';
import { comparisonCountry } from './comparisonCountries';

const TW = comparisonCountry('TW')!;
const JP = comparisonCountry('JP')!;
const CN = comparisonCountry('CN')!;
const PAIR = [JP, TW];

const web = (results: Array<Record<string, unknown>>) => ({ web: { results } });

describe('reading money out of a snippet', () => {
  /* 「¥」 is the yuan too, so it is read but not trusted to name a country. */
  it('reads a yen sign but does not call it certain', () => {
    expect(readMoney('ANESSA 日焼け止め ¥3,080 送料無料')).toEqual({ amount: 3080, currency: 'JPY', certain: false });
  });

  it('reads yen written behind', () => {
    expect(readMoney('資生堂 アネッサ 3,080円（税込）')).toEqual({ amount: 3080, currency: 'JPY', certain: true });
  });

  it('reads New Taiwan dollars', () => {
    expect(readMoney('SK-II 青春露 NT$5,200 屈臣氏')).toEqual({ amount: 5200, currency: 'TWD', certain: true });
  });

  it('reads 元', () => {
    expect(readMoney('康是美 特價 520 元')).toEqual({ amount: 520, currency: 'TWD', certain: false });
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
    ]), PAIR);

    expect(quotes[0].countryCode).toBe('JP');
    expect(quotes[0].shop).toBe('matsukiyo.co.jp');
  });

  it('files a .tw shop under 台灣', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://shopee.tw/product/1', title: 'SK-II', description: 'NT$5,200' },
    ]), PAIR);

    expect(quotes[0].countryCode).toBe('TW');
  });

  /* 「円」 names one currency, so it places a host nobody recognises. */
  it('lets an unmistakable mark place an unknown host', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://example.com/p/1', title: 'アネッサ', description: '3,080円' },
    ]), PAIR);

    expect(quotes[0].countryCode).toBe('JP');
  });

  it('keeps only the region that was asked for', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II', description: 'NT$5,200' },
      { url: 'https://www.matsukiyo.co.jp/p/1', title: 'SK-II', description: '3,080円' },
    ]), PAIR, JP);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].countryCode).toBe('JP');
  });
});

describe('what is thrown away', () => {
  /* A quote nobody can open is a remembered price wearing the same clothes. */
  it('drops a result with no https page behind it', () => {
    expect(quotesFromSearch(web([
      { url: 'http://shopee.tw/p/1', title: 'SK-II', description: 'NT$5,200' },
    ]), PAIR)).toEqual([]);
  });

  it('drops a result with no price in it at all', () => {
    expect(quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II 青春露', description: '正品保證 滿額免運' },
    ]), PAIR)).toEqual([]);
  });

  /*
    A figure outside what the thing could cost came from a snippet describing
    something else — a total, a shipping threshold, a year.
  */
  it('drops a figure nothing on a shopping list costs', () => {
    expect(quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II', description: '累積銷售 NT$98,000,000' },
    ]), PAIR)).toEqual([]);
  });

  /* Two listings from one shop is a shop disagreeing with itself. */
  it('keeps one quote per shop', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://shopee.tw/p/1', title: 'SK-II', description: 'NT$5,200' },
      { url: 'https://shopee.tw/p/2', title: 'SK-II', description: 'NT$4,900' },
    ]), PAIR);

    expect(quotes).toHaveLength(1);
  });

  it('survives a shape it does not recognise', () => {
    expect(quotesFromSearch({ nothing: true }, PAIR)).toEqual([]);
    expect(quotesFromSearch(null, PAIR)).toEqual([]);
  });

  /* Brave marks the matched words, and the tags would split a 「1,480円」. */
  it('reads through the highlighting', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://www.matsukiyo.co.jp/p/1', title: 'アネッサ', description: '<strong>3,080</strong>円' },
    ]), PAIR);

    expect(quotes[0].amount).toBe(3080);
  });
});

describe('what is asked', () => {
  it('asks each region in the language its shops price in', () => {
    expect(priceQuery('青春露', 'SK-II', JP)).toBe('SK-II 青春露 価格 通販');
    expect(priceQuery('青春露', 'SK-II', TW)).toBe('SK-II 青春露 價格 購買');
  });

  it('asks nothing for a product with no name', () => {
    expect(priceQuery('  ', undefined, TW)).toBe('');
  });

  it('sends the key as a header and never in the query', async () => {
    let seen = '';
    let headers: Record<string, string> = {};
    await searchPrices({
      name: '青春露',
      country: TW,
      inPlay: PAIR,
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
      country: TW,
      inPlay: PAIR,
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
    ]), PAIR)).toEqual([{
      countryCode: 'TW', shop: 'tw.bid.yahoo.com', amount: 699, currency: 'TWD',
      sourceUrl: 'https://tw.bid.yahoo.com/item/100269476721',
    }]);
  });
});

/**
 * 「這個腮紅的資料來源是cn 是中國價格」.
 *
 * muji.com.cn was quoted under 台灣, and in the same list 淘寶's ¥14 printed
 * as TWD 14. One hole: ¥ is the yuan as well as the yen and 元 is the yuan as
 * well as the New Taiwan dollar, so a currency mark cannot name a country.
 */
describe('a price from neither place', () => {
  it('drops a .cn shop', () => {
    expect(quotesFromSearch(web([
      { url: 'https://www.muji.com.cn/cn/product/1', title: '腮紅', description: '¥89' },
    ]), PAIR)).toEqual([]);
  });

  it('drops 淘寶 rather than printing yuan as TWD', () => {
    expect(quotesFromSearch(web([
      { url: 'https://au.world.taobao.com/item/1', title: 'ellips', description: '¥14' },
    ]), PAIR)).toEqual([]);
  });

  /* A bare ¥ on a host nobody can place could be either of two countries. */
  it('drops an uncertain mark on a host it cannot place', () => {
    expect(placeOf('example.com', { amount: 14, currency: 'JPY', certain: false }, PAIR)).toBeNull();
    expect(placeOf('example.com', { amount: 520, currency: 'TWD', certain: false }, PAIR)).toBeNull();
  });

  /* The host outranks the mark: a Taiwanese shop writing 「$520」 means TWD. */
  it('lets a known host settle an uncertain mark', () => {
    expect(placeOf('shopee.tw', { amount: 520, currency: 'JPY', certain: false }, PAIR)?.country.code)
      .toBe('TW');
    expect(placeOf('matsukiyo.co.jp', { amount: 3080, currency: 'TWD', certain: false }, PAIR)?.country.code)
      .toBe('JP');
  });

  it('keeps the shops that are in one of the two places', () => {
    const quotes = quotesFromSearch(web([
      { url: 'https://www.muji.com.cn/cn/product/1', title: '腮紅', description: '¥89' },
      { url: 'https://shop.muji.tw/SalePage/Index/1', title: '腮紅', description: '$350' },
    ]), PAIR);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].shop).toBe('shop.muji.tw');
    expect(quotes[0].currency).toBe('TWD');
  });
});

/**
 * 「這個個台幣908 你也沒列出來」.
 *
 * shampoosecret.com is a Taiwanese shop on a .com, pricing in 「$908」.
 * Requiring an unmistakable currency mark threw it away along with the yuan
 * that rule was written to catch. A shop selling in Taiwan writes in Chinese;
 * one selling in Japan has kana in it.
 */
describe('when the address will not say, the language does', () => {
  it('takes a Chinese page quoting a bare dollar as TWD', () => {
    const quotes = quotesFromSearch(web([{
      url: 'https://glamoroushairbeauty.store/product-page/sublimic-aqua',
      title: 'SUBLIMIC 水凝系列 護髮油',
      description: '為髮絲重注水分，營造順滑觸感至髮尾。$205',
    }]), PAIR);

    expect(quotes).toEqual([{
      countryCode: 'TW', shop: 'glamoroushairbeauty.store', amount: 205, currency: 'TWD',
      sourceUrl: 'https://glamoroushairbeauty.store/product-page/sublimic-aqua',
    }]);
  });

  /*
    shampoosecret.com publishes "priceCurrency": "HKD" — it is a Hong Kong
    shop, and its 「$908」 was read as NT$908 by the snippet reader and by
    both of us reading the screenshot. Listed under 香港, so a 日本／台灣 pair
    leaves it out and a 日本／香港 pair keeps it.
  */
  it('places a Hong Kong shop in Hong Kong', () => {
    const page = web([{
      url: 'https://shampoosecret.com/product/sublimic-aqua',
      title: 'SUBLIMIC 水凝系列',
      description: '$908',
    }]);

    expect(quotesFromSearch(page, PAIR)).toEqual([]);
    expect(quotesFromSearch(page, [JP, comparisonCountry('HK')!])[0]).toMatchObject({
      countryCode: 'HK', currency: 'HKD', amount: 908,
    });
  });

  it('takes a Japanese page quoting a bare yen sign as JPY', () => {
    const quotes = quotesFromSearch(web([{
      url: 'https://example.com/item/1',
      title: 'アネッサ パーフェクトUV',
      description: '日焼け止め ¥3,080 送料無料',
    }]), PAIR);

    expect(quotes[0]).toMatchObject({ countryCode: 'JP', currency: 'JPY', amount: 3080 });
  });

  /*
    The case this rule has to keep out: a US retailer's 「$44」 is not
    NT$44, and jomashop.com writes in neither language.
  */
  it('drops a dollar on a page written in neither', () => {
    expect(quotesFromSearch(web([{
      url: 'https://www.jomashop.com/shiseido-oil.html',
      title: 'Shiseido Sublimic Aqua Intensive Velvet Oil',
      description: 'Free shipping on orders over $50. $44',
    }]), PAIR)).toEqual([]);
  });

  /* Kana outranks a dollar sign: a Japanese page is not quoting NT$. */
  it('will not read a Japanese page as Taiwanese', () => {
    expect(placeOf('example.com', { amount: 520, currency: 'TWD', certain: false }, PAIR, 'ロールオン $520'))
      .toBeNull();
  });
});

/**
 * 「官網金額1400 你也寫錯」.
 *
 * jomalone.com.tw was read as NT$3,600, which is the 「消費滿 NT$3,600」 banner
 * across the top of the page. The product cost 1,400 and said so a few words
 * later. A shop's snippet opens with whatever the shop most wants said, and
 * that is the spending threshold.
 */
describe('a condition is not a price', () => {
  it('walks past the 滿額 banner to the product', () => {
    const quotes = quotesFromSearch(web([{
      url: 'https://www.jomalone.com.tw/product/25956/vitamin-e-lip-conditioner',
      title: 'Jo Malone 維他命E護唇霜',
      description: '消費滿 NT$3,600，即享限時節慶贈禮。維他命E護唇霜 15ml NT$1,400',
    }]), PAIR);

    expect(quotes[0].amount).toBe(1400);
  });

  it('ignores a 「起」 price', () => {
    expect(readMoney('護唇霜 NT$990 起')).toBeNull();
  });

  it('ignores a free-shipping threshold', () => {
    expect(readMoney('全館滿 NT$1,000 免運')).toBeNull();
  });

  /* 送料無料 after a yen price is free shipping, not a condition on it. */
  it('keeps a price that merely has free shipping after it', () => {
    expect(readMoney('アネッサ 3,080円 送料無料')).toEqual({
      amount: 3080, currency: 'JPY', certain: true,
    });
  });

  it('still reads a snippet that is only a threshold as nothing', () => {
    expect(readMoney('消費滿 NT$2,900，即享限時節慶贈禮')).toBeNull();
  });
});

/**
 * 「我覺得你要努力找到」.
 *
 * The snippet used to be a gate: a result whose first hundred characters
 * happened not to contain money was thrown away before the page was ever
 * asked. A product page's snippet is usually its description — the price is
 * in the page's structured data, which the fetcher reads accurately.
 */
describe('which results are worth fetching', () => {
  it('keeps a product page whose snippet has no price in it', () => {
    const found = candidatesFromSearch(web([{
      url: 'https://shop.muji.tw/SalePage/Index/1',
      title: '卸妝濕巾',
      description: '溫和擦拭即可卸除彩妝，攜帶方便，12片裝。',
    }]), PAIR);

    expect(found).toHaveLength(1);
    expect(found[0].url).toBe('https://shop.muji.tw/SalePage/Index/1');
    expect(found[0].snippet).toBeUndefined();
  });

  it('carries the snippet along when there was one', () => {
    const found = candidatesFromSearch(web([{
      url: 'https://shop.muji.tw/SalePage/Index/1',
      title: '卸妝濕巾',
      description: 'NT$135',
    }]), PAIR);

    expect(found[0].snippet).toMatchObject({ amount: 135, currency: 'TWD', countryCode: 'TW' });
  });

  /* A shop in a country nobody is comparing is still excluded up front. */
  it('still leaves out a shop from a country out of play', () => {
    expect(candidatesFromSearch(web([{
      url: 'https://au.world.taobao.com/item/1',
      title: 'ellips',
      description: '護髮精油',
    }]), PAIR)).toEqual([]);
  });

  /* A listing page prices nothing, however promising its snippet looks. */
  it('still leaves out pages that are not about one product', () => {
    expect(candidatesFromSearch(web([{
      url: 'https://biggo.com.tw/s/Kumargic/',
      title: 'KUMARGIC',
      description: 'NT$172',
    }]), PAIR)).toEqual([]);
  });

  it('keeps one candidate per shop', () => {
    expect(candidatesFromSearch(web([
      { url: 'https://shop.muji.tw/SalePage/Index/1', title: 'a', description: 'x' },
      { url: 'https://shop.muji.tw/SalePage/Index/2', title: 'b', description: 'y' },
    ]), PAIR)).toHaveLength(1);
  });

  /* An unknown host is kept: it may be the Taiwanese shop on a .com. */
  it('keeps a host no country claims', () => {
    expect(candidatesFromSearch(web([{
      url: 'https://glamoroushairbeauty.store/product-page/1',
      title: '護髮油',
      description: '水凝系列',
    }]), PAIR)).toHaveLength(1);
  });
});

/* 価格.com is Japan's 比價站: ¥3,000 for a 青春露 that costs five times that. */
describe('the other countries’ comparison sites', () => {
  it('refuses kakaku.com', () => {
    expect(looksLikeAProductPage('https://search.kakaku.com/sk-ii/')).toBe(false);
    expect(looksLikeAProductPage('https://kakaku.com/item/K0001234/')).toBe(false);
  });
});

/**
 * A name read off a package is not a name a shop puts in its title.
 *
 * 「うるおい線・くまスポット シニアケアMagic Concealer」 found nothing: the
 * middle dot, the marketing line and the product name are one string, and
 * every character of it was a word the search had to match.
 */
describe('asking a second way', () => {
  it('drops the typography a package carries', () => {
    expect(relaxedName('うるおい線・くまスポット シニアケアMagic Concealer'))
      .toBe('うるおい線 くまスポット シニアケアMagic Concealer');
    expect(relaxedName('【限定】雪肌精 化粧水（医薬部外品）')).toBe('雪肌精 化粧水');
  });

  it('cuts a name longer than a shop would write', () => {
    expect(relaxedName('a b c d e f g h')).toBe('a b c d e');
  });

  it('leaves a name that is already plain alone', () => {
    expect(relaxedName('SK-II 青春露')).toBe('SK-II 青春露');
  });

  it('offers the relaxed way only when it differs', () => {
    expect(priceQueries('SK-II 青春露', 'SK-II', JP)).toHaveLength(1);
    expect(priceQueries('うるおい線・くまスポット', undefined, JP)).toHaveLength(2);
  });

  /* Fifteen products that answer on the first ask must not pay for a second. */
  it('stops at the first way of asking that answers', async () => {
    const asked: string[] = [];
    const found = await searchCandidates({
      name: 'うるおい線・くまスポット',
      country: JP,
      inPlay: PAIR,
      apiKey: 'k',
      fetchImpl: (async (url: string) => {
        asked.push(String(url));
        return {
          ok: true,
          json: async () => web([{ url: 'https://shop.example.jp/item/1', title: 'a', description: '3,080円' }]),
        };
      }) as unknown as typeof fetch,
    });

    expect(asked).toHaveLength(1);
    expect(found).toHaveLength(1);
  });

  it('asks the second way when the first answers nothing', async () => {
    const asked: string[] = [];
    await searchCandidates({
      name: 'うるおい線・くまスポット',
      country: JP,
      inPlay: PAIR,
      apiKey: 'k',
      fetchImpl: (async (url: string) => {
        asked.push(String(url));
        return { ok: true, json: async () => web([]) };
      }) as unknown as typeof fetch,
    });

    expect(asked).toHaveLength(2);
    expect(new URL(asked[1]).searchParams.get('q')).toContain('うるおい線 くまスポット');
  });
});
