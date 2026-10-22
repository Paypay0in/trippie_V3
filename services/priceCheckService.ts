/**
 * What a product costs here and there.
 *
 * 「也要幫忙比價 台灣屈臣氏啊 蝦皮價格 / 日本松本清 或是其他大的美妝店大概是什麼
 * 價格」 — the question somebody is actually asking in the aisle is 「is this
 * worth carrying home」, and that is a comparison rather than a price.
 *
 * Every quote carries the page it was read from. §6 of `docs/PRODUCT.md`
 * settles who may claim a price: a figure nobody looked up is 價格需確認, and
 * a remembered one looks identical on screen to a checked one. A quote with no
 * source is dropped by the server and would be dropped here too.
 *
 * Held for the page and never written onto the item. A price read today is a
 * fact about today; stored, it becomes a claim about a day that has passed,
 * which is the same reason menu prices are not averaged across years.
 */
export interface PriceQuote {
  /** ISO code of the country the shop is in. */
  countryCode: string;
  shop: string;
  amount: number;
  currency: string;
  sourceUrl: string;
  /**
   * Roughly what it is in TWD, when the quote is in something else.
   *
   * 「日本價格有日幣金額 那要直接換算：約台幣xxxx」. Converted on the server at
   * the day's published rate, and absent rather than guessed when that rate
   * could not be read: a converted figure and an invented one look identical
   * on screen.
   *
   * 約, and never 「這邊比較便宜」 — which side wins needs a tax-refund
   * assumption and a view on baggage, and a sentence this app wrote would be
   * read as advice.
   */
  approxHome?: number;
  /** The money `approxHome` is in, so the label can name it. */
  homeCurrency?: string;
  /**
   * Whether the shop's own page stated this figure.
   *
   * False means it was read out of a search snippet. §6 of
   * `docs/PRODUCT.md`: a figure nobody looked up is 價格需確認, and on screen
   * it looks identical to one that was — so it says so.
   */
  verified?: boolean;
  /**
   * How this quote was decided to be that country's price.
   *
   * 「我覺得你要區分很清楚 日本的價格來源 以及台灣的價格來源」. `host` is the
   * shop's own address; `mark` is the currency it published; `language` is
   * only how its page is written, which is an inference and says so.
   */
  placement?: 'host' | 'mark' | 'language';
}

export interface PriceCheck {
  quotes: PriceQuote[];
  /** When it was read, so the reader can judge how old 「now」 is. */
  readAt: string;
  /**
   * Why there are none, when the reason is not 「there are none」.
   *
   * 「價格一定找得到 別騙我」 — he was right. The lookup was answering 查不到這
   * 個商品的售價 while the actual failure was the project's search allowance
   * being spent. Those two ask opposite things of the reader: one says stop
   * looking, the other says try tomorrow.
   */
  error?: string;
}

const cache = new Map<string, PriceCheck>();
const pending = new Map<string, Promise<PriceCheck>>();

/** For tests: the cache lives for the page, which is longer than one case. */
export const clearPriceCheckCache = () => { cache.clear(); pending.clear(); };

const EMPTY: PriceCheck = { quotes: [], readAt: '' };

export const checkPrices = (product: {
  name: string;
  brand?: string;
  /** Where the trip is, as an ISO code. */
  destinationCountry?: string;
  /** Where it is being compared against. */
  homeCountry?: string;
}): Promise<PriceCheck> => {
  /*
    The pair is part of the key. The same bottle compared 日本/台灣 and
    日本/香港 are two different questions, and answering the second from the
    first's cache is how a Hong Kong price appears under 台灣價格.
  */
  const key = [product.name, product.brand ?? '', product.destinationCountry ?? '', product.homeCountry ?? '']
    .join('|').toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = fetch('/api/shopping/price-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: product.name,
      brand: product.brand,
      destinationCountry: product.destinationCountry,
      homeCountry: product.homeCountry,
    }),
  })
    .then(async response => {
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      // The server's own sentence, kept: it knows whether this is worth
      // retrying today and a generic one here would hide that.
      if (!response.ok) {
        return { quotes: [], readAt: '', error: typeof payload.error === 'string' ? payload.error : '現在查不到價格。' };
      }
      return payload;
    })
    .then(payload => ({
      quotes: Array.isArray(payload.quotes)
        ? (payload.quotes as PriceQuote[]).filter(quote => quote?.sourceUrl && quote.amount > 0)
        : [],
      readAt: typeof payload.readAt === 'string' ? payload.readAt : '',
      ...(typeof payload.error === 'string' ? { error: payload.error } : {}),
    }))
    .catch(() => ({ ...EMPTY, error: '現在查不到價格。' }))
    /*
      A failure is not cached. 「今天用完了」 becomes false tomorrow, and a
      cached refusal would outlive the thing that caused it.
    */
    .then(result => { if (!result.error) cache.set(key, result); pending.delete(key); return result; });

  pending.set(key, request);
  return request;
};

/** 「TWD 1,200」 — the money as the shop quoted it, never converted. */
export const quoteLabel = (quote: PriceQuote): string =>
  `${quote.currency} ${Math.round(quote.amount).toLocaleString()}`;

/** 「約台幣 1,234」, for a quote not already in the money being compared to. */
export const approxHomeLabel = (quote: PriceQuote, moneyName: string): string =>
  (quote.currency !== quote.homeCurrency
    && typeof quote.approxHome === 'number'
    && quote.approxHome > 0
    ? `約${moneyName} ${Math.round(quote.approxHome).toLocaleString()}`
    : '');

/**
 * The quotes grouped by where they were found, cheapest first.
 *
 * No cross-currency comparison and no 「這邊比較便宜」. That needs a rate, a
 * tax-refund assumption and a view on baggage, and a sentence this app wrote
 * would be read as advice. The two columns are put side by side and the
 * traveller does the arithmetic they were going to do anyway.
 */
export const quotesIn = (quotes: PriceQuote[], countryCode: string): PriceQuote[] =>
  quotes
    .filter(quote => quote.countryCode === countryCode)
    .sort((left, right) => left.amount - right.amount);
