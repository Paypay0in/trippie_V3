/**
 * A price read out of a web search result, when the grounded model cannot run.
 *
 * 「價格的部分 不能也用brave搜尋嗎」. It can, and it is not the same job the
 * image search was: Brave hands back a picture's URL as a field, while a price
 * is only ever a few characters inside the snippet under a shop's listing.
 *
 * So this is deliberately narrow about what it will believe:
 *
 * - The number must carry its own currency mark — 「1,480円」, 「NT$520」. A
 *   bare number in a snippet is a size, a review count or a model number far
 *   more often than it is money.
 * - The page it was read from travels with it, because §6 of
 *   `docs/PRODUCT.md` is what settles who may claim a price: one nobody can
 *   check looks identical on screen to one that was.
 * - A figure outside what the thing could plausibly cost is dropped rather
 *   than shown, because the snippet that produced it was describing something
 *   else.
 *
 * What it still cannot know is whether the snippet was pricing the same size.
 * That is why the quote is labelled as read from a search result rather than
 * presented as the shop's own answer.
 */

export interface SearchedQuote {
  region: '台灣' | '日本';
  shop: string;
  amount: number;
  currency: string;
  sourceUrl: string;
}

/** What to ask, per region, in the language that region's shops price in. */
export const priceQuery = (name: string, brand: string | undefined, region: '台灣' | '日本'): string => {
  const product = [brand?.trim(), name.trim()].filter(Boolean).join(' ');
  if (!product) return '';
  return region === '日本' ? `${product} 価格 通販` : `${product} 價格 購買`;
};

/**
 * The shops each region is asked about, as hosts rather than as names.
 *
 * A snippet from a Japanese shop quoted in yen is a Japanese price whatever
 * language the page is in, so the host decides and the currency only breaks
 * the tie.
 */
const TAIWAN_HOST = /(^|\.)(tw|com\.tw)$|shopee\.tw|momoshop|pchome|cosmed|watsons/i;
const JAPAN_HOST = /(^|\.)jp$|amazon\.co\.jp|rakuten|matsukiyo|welcia|donki|cosme\.net/i;

/*
  Pages whose number is never this product's price.

  Measured against the live search on 2026-10-22 with five real rows off the
  Founder's list. Every wrong quote came from the same two shapes:

  - a price-comparison site, whose figure is the cheapest of whatever its
    crawler matched — 「KUMARGIC EYE」 came back NT$172 from one, for
    something else entirely;
  - a brand's front page or a category listing, where the number belongs to
    whatever happened to be in the snippet. 青春露 came back ¥98,200 from a
    duty-free shop's brand index.

  Both look exactly like a shop when all you have is a host and a snippet. A
  product page is the only page whose price is about the product.
*/
const AGGREGATOR = /biggo|findprice|feebee|ecshopping|pricearea|shopping\.yahoo\.co\.jp\/search/i;

/** Paths that list things rather than being one. */
const LISTING = /\/(s|search|category|categories|brands?|list|goodsList|tag)(\/|\.|$)|default\.aspx|\/shop\/?$/i;

/** A page that is about one product, as far as its URL can say. */
export const looksLikeAProductPage = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (AGGREGATOR.test(parsed.hostname + parsed.pathname)) return false;
    if (LISTING.test(parsed.pathname)) return false;
    // A front page prices nothing, and a search query is somebody else's list.
    if (parsed.pathname.replace(/\/+$/, '') === '') return false;
    if (parsed.searchParams.has('q') || parsed.searchParams.has('keyword')) return false;
    // `?cid=` is a campaign landing page: one banner, many products, one of
    // their prices in the snippet. 青春露 came back ¥2,000 off one.
    if (parsed.searchParams.has('cid')) return false;
    return true;
  } catch {
    return false;
  }
};

/** What a thing on a shopping list could plausibly cost, per currency. */
const PLAUSIBLE: Record<string, { min: number; max: number }> = {
  TWD: { min: 10, max: 100_000 },
  JPY: { min: 50, max: 500_000 },
};

/**
 * Money inside a snippet, with the currency it was written in.
 *
 * The currency mark is required. Without one the commonest match in a product
 * snippet is the size: 「50ml」 and 「30g」 are numbers beside the name of the
 * thing, in exactly the place a price would be.
 */
export const readMoney = (text: string): { amount: number; currency: string } | null => {
  const yen = text.match(/[¥￥]\s*([\d,]+)|([\d,]+)\s*円/);
  if (yen) {
    const amount = Number((yen[1] ?? yen[2] ?? '').replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: 'JPY' };
  }
  const twd = text.match(/NT\$?\s*([\d,]+)|\$\s*([\d,]+)|([\d,]+)\s*元/i);
  if (twd) {
    const amount = Number((twd[1] ?? twd[2] ?? twd[3] ?? '').replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) return { amount, currency: 'TWD' };
  }
  return null;
};

/** The host, without the `www.`, which is the only shop name a snippet owns. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const regionOf = (host: string, currency: string): '台灣' | '日本' | null => {
  if (JAPAN_HOST.test(host)) return '日本';
  if (TAIWAN_HOST.test(host)) return '台灣';
  if (currency === 'JPY') return '日本';
  if (currency === 'TWD') return '台灣';
  return null;
};

interface BraveWebResult {
  url?: unknown;
  title?: unknown;
  description?: unknown;
}

/**
 * The quotes a search answer actually contains, at most one per shop.
 *
 * Two listings from the same shop are the same shop disagreeing with itself,
 * which on a phone in an aisle is noise rather than a comparison.
 */
export const quotesFromSearch = (payload: unknown, want?: '台灣' | '日本'): SearchedQuote[] => {
  const results = (payload as { web?: { results?: unknown } })?.web?.results;
  if (!Array.isArray(results)) return [];

  const found: SearchedQuote[] = [];
  const seen = new Set<string>();

  for (const entry of results as BraveWebResult[]) {
    const url = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (!/^https:\/\//.test(url)) continue;
    if (!looksLikeAProductPage(url)) continue;

    const host = hostOf(url);
    if (!host || seen.has(host)) continue;

    const text = [entry?.title, entry?.description]
      .map(value => (typeof value === 'string' ? value : ''))
      .join(' ')
      // Brave marks the matched words; the tags would split a 「1,480円」.
      .replace(/<[^>]+>/g, '');

    const money = readMoney(text);
    if (!money) continue;

    const bounds = PLAUSIBLE[money.currency];
    if (bounds && (money.amount < bounds.min || money.amount > bounds.max)) continue;

    const region = regionOf(host, money.currency);
    if (!region || (want && region !== want)) continue;

    seen.add(host);
    found.push({ region, shop: host, amount: money.amount, currency: money.currency, sourceUrl: url });
  }

  return found;
};

/**
 * Asks Brave for one region's prices.
 *
 * Verified against the live endpoint on 2026-10-22: `/res/v1/web/search`
 * answers 422 naming `x-subscription-token` as the missing header, which is a
 * route that exists rejecting a request it understood.
 */
export const searchPrices = async (input: {
  name: string;
  brand?: string;
  region: '台灣' | '日本';
  apiKey: string;
  fetchImpl?: typeof fetch;
}): Promise<SearchedQuote[]> => {
  const query = priceQuery(input.name, input.brand, input.region);
  if (!query) return [];

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '10');
  url.searchParams.set('country', input.region === '日本' ? 'JP' : 'TW');

  const response = await (input.fetchImpl ?? fetch)(url.toString(), {
    headers: { Accept: 'application/json', 'X-Subscription-Token': input.apiKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const error = new Error(`price search ${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return quotesFromSearch(await response.json(), input.region);
};
