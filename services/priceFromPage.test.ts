/**
 * 「官網金額1400 你也寫錯」, and the three before it.
 *
 * Every one of those was the snippet being read: a condition instead of a
 * price, a comparison site's cheapest match, yuan wearing a dollar sign. The
 * page states its own price, with its own currency, and that settles all of
 * them at once.
 */
import { describe, expect, it } from 'vitest';
import { isUsableCurrency, priceFromHtml, readPagePrice } from './priceFromPage';

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
