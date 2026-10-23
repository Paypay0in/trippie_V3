/**
 * 「官網金額1400 你也寫錯」, and the three before it.
 *
 * Every one of those was the snippet being read: a condition instead of a
 * price, a comparison site's cheapest match, yuan wearing a dollar sign. The
 * page states its own price, with its own currency, and that settles all of
 * them at once.
 */
import { describe, expect, it } from 'vitest';
import { isUsableCurrency, offersFromHtml, offersFromText, priceFromHtml, readPage, readPagePrice } from './priceFromPage';

const ld = (data: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head></html>`;

describe('what the page says it costs', () => {
  it('reads a product with one offer', () => {
    expect(priceFromHtml(ld({
      '@type': 'Product',
      name: 'Vitamin E Lip Conditioner',
      offers: { '@type': 'Offer', price: '1400', priceCurrency: 'TWD' },
    }))).toEqual({ amount: 1400, currency: 'TWD' });
  });

  /* The 滿額 banner is not in the structured data at all. That is the point. */
  it('is not fooled by a spending threshold elsewhere on the page', () => {
    const html = `<p>消費滿 NT$3,600，即享限時節慶贈禮</p>${ld({
      '@type': 'Product',
      offers: { price: 1400, priceCurrency: 'TWD' },
    })}`;

    expect(priceFromHtml(html)).toEqual({ amount: 1400, currency: 'TWD' });
  });

  /* 「細支套裝 $908」 and 「$350」 are two offers; the low one is the quote. */
  it('takes the lowest of several offers', () => {
    expect(priceFromHtml(ld({
      '@type': 'Product',
      offers: [
        { price: 908, priceCurrency: 'TWD' },
        { price: 350, priceCurrency: 'TWD' },
      ],
    }))).toEqual({ amount: 350, currency: 'TWD' });
  });

  it('reads an AggregateOffer by its low price', () => {
    expect(priceFromHtml(ld({
      '@type': 'Product',
      offers: { '@type': 'AggregateOffer', lowPrice: 908, highPrice: 2020, priceCurrency: 'TWD' },
    }))).toEqual({ amount: 908, currency: 'TWD' });
  });

  it('finds the product inside an @graph', () => {
    expect(priceFromHtml(ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': 'Product', offers: { price: '3080', priceCurrency: 'JPY' } },
      ],
    }))).toEqual({ amount: 3080, currency: 'JPY' });
  });

  it('falls back to the Open Graph product tags', () => {
    expect(priceFromHtml(`<meta property="product:price:amount" content="1400">
      <meta property="product:price:currency" content="TWD">`))
      .toEqual({ amount: 1400, currency: 'TWD' });
  });

  it('reads the tags when the template writes content first', () => {
    expect(priceFromHtml(`<meta content="3080" property="product:price:amount">
      <meta content="JPY" property="product:price:currency">`))
      .toEqual({ amount: 3080, currency: 'JPY' });
  });

  /*
    An amount with no currency is the dollar-sign problem one layer down.
  */
  it('refuses an amount with no currency beside it', () => {
    expect(priceFromHtml(ld({ '@type': 'Product', offers: { price: 1400 } }))).toBeNull();
    expect(priceFromHtml('<meta property="product:price:amount" content="1400">')).toBeNull();
  });

  it('survives a page with nothing in it, and broken JSON', () => {
    expect(priceFromHtml('<html><body>hello</body></html>')).toBeNull();
    expect(priceFromHtml('<script type="application/ld+json">{ not json </script>')).toBeNull();
  });
});

describe('reading the page', () => {
  const page = (html: string) => (async () => ({ ok: true, text: async () => html })) as unknown as typeof fetch;

  it('returns what the page states', async () => {
    expect(await readPagePrice('https://shop/1', page(ld({
      '@type': 'Product', offers: { price: 1400, priceCurrency: 'TWD' },
    })))).toEqual({ amount: 1400, currency: 'TWD' });
  });

  /*
    A currency this trip does not spend is still an answer, and it is
    returned as one. 「the page says nothing」 lets the caller keep the
    snippet; 「the page says Hong Kong dollars」 must not, or HK$908 is
    printed as NT$908 — which is exactly what shampoosecret.com's own data
    says it was.
  */
  it('reports a currency this trip cannot use rather than hiding it', async () => {
    expect(await readPagePrice('https://shop/1', page(ld({
      '@type': 'Product', offers: { price: 908, priceCurrency: 'HKD' },
    })))).toEqual({ amount: 908, currency: 'HKD' });
    expect(isUsableCurrency('HKD')).toBe(false);
    expect(isUsableCurrency('TWD')).toBe(true);
    expect(isUsableCurrency('JPY')).toBe(true);
  });

  /* The shape shampoosecret.com actually publishes. */
  it('reads an AggregateOffer whose priceSpecification is a list', async () => {
    expect(await readPagePrice('https://shop/1', page(ld({
      '@type': 'Product',
      offers: [{
        '@type': 'AggregateOffer',
        lowPrice: '908',
        highPrice: '2020',
        priceSpecification: [{ '@type': 'UnitPriceSpecification', price: '908', priceCurrency: 'HKD' }],
        priceCurrency: 'HKD',
      }],
    })))).toEqual({ amount: 908, currency: 'HKD' });
  });

  it('gives up quietly when the shop will not answer', async () => {
    expect(await readPagePrice('https://shop/1', (async () => ({ ok: false })) as unknown as typeof fetch))
      .toBeNull();
    expect(await readPagePrice('https://shop/1', (async () => { throw new Error('timeout'); }) as unknown as typeof fetch))
      .toBeNull();
  });
});

/**
 * A shop with a shade picker names its offer after the shade.
 *
 * momoshop quoted NT$300 under an offer called 「05甜美杏桃」, which is a
 * colour. The product it belongs to is named around it, and both are needed
 * before anything can say whether this is the 腮紅 on the list.
 */
describe('a variant inside a product', () => {
  it('keeps the product name beside the variant name', () => {
    const offers = offersFromHtml(ld({
      '@type': 'Product',
      name: 'CANMAKE 腮紅',
      offers: { '@type': 'Offer', name: '05甜美杏桃', price: 300, priceCurrency: 'TWD' },
    }));

    expect(offers).toEqual([{
      name: '05甜美杏桃', productName: 'CANMAKE 腮紅', amount: 300, currency: 'TWD',
    }]);
  });

  /* Every product on the page, not the first one with a price. */
  it('returns all of them', () => {
    const offers = offersFromHtml(ld([
      { '@type': 'Product', name: '乳木果油霜', offers: { price: 389, priceCurrency: 'TWD' } },
      { '@type': 'Product', name: 'SHIRO 身體乳', offers: { price: 1200, priceCurrency: 'TWD' } },
    ]));

    expect(offers.map(offer => offer.name)).toEqual(['乳木果油霜', 'SHIRO 身體乳']);
  });
});

/**
 * Who this says it is, and what to do when that is refused.
 *
 * Measured twice each on 2026-10-22: askul.co.jp answers 「Trippie/3.0」 and
 * refuses a browser string; muji.com/jp and jomalone.com.tw do the opposite.
 * A single fixed header loses a shop whichever it picks.
 */
describe('introducing ourselves', () => {
  const refusing = (allowed: string) => {
    const seen: string[] = [];
    const impl = (async (_url: string, init: RequestInit) => {
      const agent = (init.headers as Record<string, string>)['User-Agent'];
      seen.push(agent);
      return agent === allowed
        ? { ok: true, text: async () => ld({ '@type': 'Product', offers: { price: 390, priceCurrency: 'JPY' } }) }
        : { ok: false, status: 403 };
    }) as unknown as typeof fetch;
    return { impl, seen };
  };

  it('says who it is first', async () => {
    const { impl, seen } = refusing('Mozilla/5.0 (compatible; Trippie/3.0; +https://trippie-v3.onrender.com)');

    const read = await readPage('https://shop/1', impl);

    expect(read.price).toEqual({ amount: 390, currency: 'JPY' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('Trippie/3.0');
  });

  /* And only where saying so gets the door shut. */
  it('asks again as a browser when that is refused', async () => {
    const { impl, seen } = refusing('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    const read = await readPage('https://shop/1', impl);

    expect(read.price).toEqual({ amount: 390, currency: 'JPY' });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('Trippie/3.0');
    expect(seen[1]).toContain('Chrome');
  });

  it('gives up after the second try', async () => {
    const { impl, seen } = refusing('nobody');

    expect(await readPage('https://shop/1', impl))
      .toEqual({ reachable: false, price: null, offers: [] });
    expect(seen).toHaveLength(2);
  });
});

/**
 * 「我還是覺得找價格能力要更強」 — 「少太多了」.
 *
 * Measured across twelve real products in two countries: 24 lookups, 6
 * prices. Eleven of the eighteen failures were pages that opened, matched,
 * and published no machine-readable price. 香奈兒, 安耐曬, 雪肌精, CANMAKE all
 * write the figure for people and not for crawlers.
 */
describe('the price a page writes for people', () => {
  it('reads markup that names itself', () => {
    expect(offersFromText('<span itemprop="price" content="3080">三千八十円</span>', 'JPY'))
      .toEqual([{ name: '', amount: 3080, currency: 'JPY', fromText: true }]);
    expect(offersFromText('<div class="product-price">NT$1,400</div>', 'TWD')[0].amount)
      .toBe(1400);
  });

  it('reads a number standing beside a word that says it is a price', () => {
    expect(offersFromText('<p>販売価格 3,080円（税込）</p>', 'JPY')[0].amount).toBe(3080);
    expect(offersFromText('<p>售價 NT$1,400</p>', 'TWD')[0].amount).toBe(1400);
  });

  /* The one that got through twice. A condition is not a price. */
  it('refuses a threshold, a shipping line and a points line', () => {
    expect(offersFromText('<p>消費滿 NT$3,600 即贈</p>', 'TWD')).toEqual([]);
    expect(offersFromText('<p>価格 3,000円以上で送料無料</p>', 'JPY')).toEqual([]);
    expect(offersFromText('<p>まとめ買い価格 2,293円</p>', 'JPY')).toEqual([]);
  });

  /*
    Only a mark naming the money this country spends. 「$908」 was HK$908, and
    「元」 is 人民幣 as readily as 新台幣.
  */
  it('insists on the currency it was told to expect', () => {
    expect(offersFromText('<p>価格 $908</p>', 'JPY')).toEqual([]);
    expect(offersFromText('<p>售價 ¥14</p>', 'TWD')).toEqual([]);
    expect(offersFromText('<p>售價 NT$1,400</p>', 'JPY')).toEqual([]);
  });

  /* A page is full of numbers, and none of the loose ones is money. */
  it('refuses a number with no price word anywhere near it', () => {
    expect(offersFromText('<p>容量 45ml　評價 4.6 星　共 1,284 則</p>', 'JPY')).toEqual([]);
    expect(offersFromText('<p>2026 新上市</p>', 'TWD')).toEqual([]);
  });

  /* Prices inside a script tag are a template, not the page. */
  it('does not read the page’s own code', () => {
    expect(offersFromText('<script>var price = "価格 9999円";</script>', 'JPY')).toEqual([]);
  });

  it('says nothing for a currency it has no pattern for', () => {
    expect(offersFromText('<p>price 10 EUR</p>', 'EUR')).toEqual([]);
  });
});

describe('written only where nothing was published', () => {
  const page = (html: string) => (async () => ({ ok: true, text: async () => html })) as unknown as typeof fetch;

  /* Structured data is the stronger statement and keeps winning. */
  it('prefers what the shop published for machines', async () => {
    const html = `<p>販売価格 9,999円</p>${ld({
      '@type': 'Product', offers: { price: 3080, priceCurrency: 'JPY' },
    })}`;

    const read = await readPage('https://shop/1', page(html), 'JPY');

    expect(read.price).toEqual({ amount: 3080, currency: 'JPY' });
    expect(read.offers[0].fromText).toBeUndefined();
  });

  it('falls back to the writing when there is nothing else', async () => {
    const read = await readPage('https://shop/1', page('<p>販売価格 3,080円</p>'), 'JPY');

    expect(read.price).toEqual({ amount: 3080, currency: 'JPY' });
    expect(read.offers[0].fromText).toBe(true);
  });

  /* And not at all when the caller cannot say which money to expect. */
  it('reads nothing written when no currency was given', async () => {
    expect((await readPage('https://shop/1', page('<p>販売価格 3,080円</p>'))).offers).toEqual([]);
  });
});

/* 「蒸氣眼罩 ¥13」 — a currency mark beside a price label, and not a price. */
describe('a figure that is not a price at all', () => {
  it('refuses an amount nothing on a shopping list costs', () => {
    expect(offersFromText('<p>価格 13円</p>', 'JPY')).toEqual([]);
    expect(offersFromText('<p>価格 980,000円</p>', 'JPY')).toEqual([]);
    expect(offersFromText('<p>售價 NT$3</p>', 'TWD')).toEqual([]);
    expect(offersFromText('<p>価格 660円</p>', 'JPY')[0].amount).toBe(660);
  });
})
