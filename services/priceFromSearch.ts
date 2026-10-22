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

/** A number with a currency mark, and whether that mark named one country. */
export interface Money {
  amount: number;
  currency: string;
  /** 「円」 and 「NT$」 are certain; 「¥」, 「$」 and 「元」 are not. */
  certain: boolean;
}

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
  Shops in neither place, dropped rather than guessed at.

  「這個腮紅的資料來源是cn 是中國價格」 — muji.com.cn quoted under 台灣, and
  in the same list 淘寶's ¥14 printed as TWD 14. Both come from the same
  hole: ¥ is the yuan as well as the yen, and 元 is the yuan as well as the
  New Taiwan dollar, so a snippet's currency mark cannot name a country on
  its own.

  This list is not a judgement about these shops. It is that a price from
  them answers a question nobody asked: the row says 松本清 or 屈臣氏, and
  the traveller is flying to one of two places.
*/
const CHINA_HOST = /(^|\.)cn$|taobao|tmall|jd\.com|1688|pinduoduo|xiaohongshu|dangdang|vip\.com|suning/i;

/** The scripts that say which of the two a shop is writing for. */
const KANA = /[\u3040-\u30ff]/;
const HAN = /[\u4e00-\u9fff]/;

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
export const readMoney = (text: string): Money | null => {
  const found = allMoney(text);
  // 「円」 and 「NT$」 name one currency each, so they are preferred over a
  // mark the host will have to settle.
  return found.find(money => money.certain && money.currency === 'JPY')
    ?? found.find(money => money.certain)
    ?? found[0]
    ?? null;
};

/*
  Numbers that are a condition rather than a price.

  「官網金額1400 你也寫錯」 — jomalone.com.tw was read as NT$3,600, which is
  the 「消費滿 NT$3,600」 banner across the top of the page. The product cost
  1,400 and said so a few words later.

  A shop's snippet opens with whatever the shop most wants said, and what a
  shop most wants said is the spending threshold. Both figures are real money
  on a real product page, so no bound and no host check can tell them apart:
  only the words around them can.
*/
const BEFORE_A_THRESHOLD = /滿|超過|以上|單筆|全館|現折|折抵|送|贈|券|起$|最低|up to|over/i;
/*
  Only words that make the number a floor. Not 「送」: 「¥3,080 送料無料」 is a
  price followed by free shipping, which is the commonest shape there is on a
  Japanese product page.
*/
const AFTER_A_THRESHOLD = /^\s*(以上|起|免運)/;

/** Every figure in the snippet that is money and is not a condition. */
const allMoney = (text: string): Money[] => {
  const pattern = /([\d,]+)\s*円|NT\$\s*([\d,]+)|[¥￥]\s*([\d,]+)|\$\s*([\d,]+)|([\d,]+)\s*元/g;
  const found: Money[] = [];

  for (const match of text.matchAll(pattern)) {
    const [yen, ntd, yuanish, dollar, chineseUnit] = match.slice(1);
    const raw = yen ?? ntd ?? yuanish ?? dollar ?? chineseUnit ?? '';
    const amount = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const at = match.index ?? 0;
    if (BEFORE_A_THRESHOLD.test(text.slice(Math.max(0, at - 8), at))) continue;
    if (AFTER_A_THRESHOLD.test(text.slice(at + match[0].length))) continue;

    if (yen !== undefined) { found.push({ amount, currency: 'JPY', certain: true }); continue; }
    if (ntd !== undefined) { found.push({ amount, currency: 'TWD', certain: true }); continue; }
    // A 「¥」 leans yen, the other two lean dollar; the host decides either way.
    found.push({ amount, currency: yuanish !== undefined ? 'JPY' : 'TWD', certain: false });
  }

  return found;
};

/** The host, without the `www.`, which is the only shop name a snippet owns. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Where a quote is from, and in what.
 *
 * The host decides. A shop in Japan quoting 「¥3,080」 is quoting yen and a
 * shop in Taiwan quoting 「$520」 is quoting New Taiwan dollars, and neither
 * mark says so on its own.
 *
 * When the host says nothing, only a mark that names one currency is
 * believed: 「円」 is yen anywhere, 「NT$」 is the New Taiwan dollar anywhere,
 * and a bare 「¥」 on a host nobody can place could be either of two countries
 * — one of which this trip is not going to.
 */
export const placeOf = (
  host: string,
  money: Money,
  text = '',
): { region: '台灣' | '日本'; currency: string } | null => {
  if (CHINA_HOST.test(host)) return null;
  if (JAPAN_HOST.test(host)) return { region: '日本', currency: 'JPY' };
  if (TAIWAN_HOST.test(host)) return { region: '台灣', currency: 'TWD' };
  if (money.certain) {
    return money.currency === 'JPY'
      ? { region: '日本', currency: 'JPY' }
      : { region: '台灣', currency: 'TWD' };
  }

  /*
    The language the shop is writing in, when its address will not say.

    「這個個台幣908 你也沒列出來」 — shampoosecret.com is a Taiwanese shop on
    a .com, pricing in 「$908」, and requiring an unmistakable mark had thrown
    it away along with the yuan it was meant to catch.

    A page selling in Taiwan is written in Chinese; one selling in Japan has
    kana in it. That is a weaker signal than a .tw, and it is a much stronger
    one than the dollar sign — which is also how jomashop.com's US 「$44」
    stays out, being written in neither.
  */
  if (KANA.test(text)) return money.currency === 'JPY' ? { region: '日本', currency: 'JPY' } : null;
  if (HAN.test(text) && money.currency === 'TWD') return { region: '台灣', currency: 'TWD' };
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

    const place = placeOf(host, money, text);
    if (!place || (want && place.region !== want)) continue;

    const bounds = PLAUSIBLE[place.currency];
    if (bounds && (money.amount < bounds.min || money.amount > bounds.max)) continue;

    seen.add(host);
    found.push({
      region: place.region,
      shop: host,
      amount: money.amount,
      currency: place.currency,
      sourceUrl: url,
    });
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
