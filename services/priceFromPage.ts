/**
 * The price a product page states about itself.
 *
 * Four times in one night the search snippet was read and four times it was
 * the wrong number: a comparison site's cheapest match, a brand index's
 * whatever-was-nearest, 淘寶's yuan wearing a dollar sign, and
 * 「消費滿 NT$3,600」 — a real figure, on the real page, that is a condition
 * rather than a price.
 *
 * None of those are fixable by reading the snippet more carefully. A snippet
 * is the first hundred characters of a page, chosen by a crawler for
 * relevance, and the price is only in it by luck.
 *
 * So the page is asked. Shops publish a machine-readable price for exactly
 * this reason — Google's product listings run on it — and what they publish
 * carries its own currency, which settles the question a dollar sign cannot:
 * 「$908」 is ambiguous, `"priceCurrency": "TWD"` is not.
 *
 * The snippet stays as the fallback, so a page that states nothing still
 * shows what it showed before.
 */

export interface PagePrice {
  amount: number;
  currency: string;
}

/** The currencies a shopping list for this trip can use. */
const USABLE = new Set(['TWD', 'JPY']);

/**
 * Whether a stated price is money this trip spends.
 *
 * Exported because the difference matters to the caller: a page that states
 * HKD has said something, and the right answer is to drop the quote rather
 * than fall back to a snippet that would print the same figure as TWD.
 * shampoosecret.com's 「$908」 is HK$908 — its own structured data says so,
 * and both the snippet reader and the person reading the screenshot took it
 * for New Taiwan dollars.
 */
export const isUsableCurrency = (currency: string): boolean => USABLE.has(currency);

const asAmount = (value: unknown): number | null => {
  const amount = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const asCurrency = (value: unknown): string =>
  (typeof value === 'string' ? value.trim().toUpperCase() : '');

/**
 * One thing a page says it is selling, and what it says it costs.
 *
 * The name travels with the price because the price alone cannot be checked.
 * 「米糠发酵修护舒缓湿敷面膜」 was quoted NT$490 from a page titled 「米糠發酵
 * 導入美容液，50ml」 — the right shop, a real price, the wrong product — and
 * nothing downstream could tell, because all it received was a number.
 */
export interface PageOffer {
  /**
   * What the page calls this thing — the offer's own name when it has one.
   *
   * On a shop with a shade or size picker this is the variant alone:
   * momoshop named its offer 「05甜美杏桃」, which is a colour and not a
   * product, so it is read together with `productName` rather than instead
   * of it.
   */
  name: string;
  /** What the product as a whole is called, when the offer sits inside one. */
  productName?: string;
  amount: number;
  currency: string;
  /** schema.org availability, when stated. */
  availability?: string;
}

/**
 * `offers` is whatever the shop felt like: one object, a list of them, or an
 * `AggregateOffer` with a low and a high. The low is the one a traveller is
 * being quoted — the high is the gift set.
 */
const fromOffers = (offers: unknown): Omit<PageOffer, 'name'> | null => {
  if (Array.isArray(offers)) {
    const found = offers.map(fromOffers).filter((price): price is Omit<PageOffer, 'name'> => price !== null);
    return found.sort((left, right) => left.amount - right.amount)[0] ?? null;
  }
  if (!offers || typeof offers !== 'object') return null;
  const offer = offers as Record<string, unknown>;
  const currency = asCurrency(offer.priceCurrency);
  // `priceSpecification` is an object on some shops and a list on others.
  const spec = Array.isArray(offer.priceSpecification)
    ? offer.priceSpecification[0] as Record<string, unknown> | undefined
    : offer.priceSpecification as Record<string, unknown> | undefined;
  const amount = asAmount(offer.price)
    ?? asAmount(offer.lowPrice)
    ?? asAmount(spec?.price);
  if (amount === null || !currency) return null;
  return {
    amount,
    currency,
    ...(typeof offer.availability === 'string' ? { availability: offer.availability } : {}),
  };
};

/** Every object inside a JSON-LD blob, however deeply it was nested. */
const walk = function* (node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const entry of node) yield* walk(entry);
    return;
  }
  if (!node || typeof node !== 'object') return;
  yield node as Record<string, unknown>;
  for (const value of Object.values(node as Record<string, unknown>)) yield* walk(value);
};

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Everything the page offers, not the first thing it offers.
 *
 * 「一頁兩個商品，我的程式取第一個」 — roomie.tw's article carried two Products
 * and the reader took the shea butter cream's NT$389 for a lip oil. A page
 * with several products is the normal case on a shop too: a size picker, a
 * related-items rail, a gift set. Which one was wanted is a question only the
 * caller can answer, so all of them are returned and none is chosen here.
 */
export const offersFromHtml = (html: string): PageOffer[] => {
  const found: PageOffer[] = [];

  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    for (const node of walk(parsed)) {
      const price = fromOffers(node.offers);
      if (!price) continue;
      /*
        The offer's own name when it has one — a shop that lists several
        sizes names them on the offer rather than on the product.
      */
      const offerName = Array.isArray(node.offers)
        ? textOf((node.offers[0] as Record<string, unknown>)?.name)
        : textOf((node.offers as Record<string, unknown>)?.name);
      found.push({
        name: offerName || textOf(node.name),
        ...(textOf(node.name) ? { productName: textOf(node.name) } : {}),
        ...price,
      });
    }
  }

  if (found.length > 0) return found;

  /*
    Open Graph's product tags, which most storefronts emit even without
    structured data. The currency is required here too: an amount with no
    currency is the dollar-sign problem again, one layer down.
  */
  const attr = (name: string): string => {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      'i',
    );
    const direct = html.match(pattern);
    if (direct) return direct[1];
    // Some templates put `content` before the name.
    const reversed = html.match(new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${name}["']`,
      'i',
    ));
    return reversed ? reversed[1] : '';
  };

  const amount = asAmount(attr('product:price:amount') || attr('og:price:amount') || attr('price'));
  const currency = asCurrency(
    attr('product:price:currency') || attr('og:price:currency') || attr('priceCurrency'),
  );
  if (amount === null || !currency) return [];

  /*
    The page's own title is the only name a meta-tagged price has. It is the
    whole of what 「米糠發酵導入美容液，50ml」 was: a true title, beside a true
    price, for a product nobody asked about.
  */
  const title = attr('og:title') || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  return [{ name: title.trim(), amount, currency }];
};

/** The cheapest thing the page offers, for callers with nothing to match on. */
export const priceFromHtml = (html: string): PagePrice | null => {
  const offers = offersFromHtml(html);
  if (offers.length === 0) return null;
  const cheapest = [...offers].sort((left, right) => left.amount - right.amount)[0];
  return { amount: cheapest.amount, currency: cheapest.currency };
};

/**
 * What came of asking one product page.
 *
 * 「我點入後會有找不到網頁的狀況」 — the fetch failing and the page publishing
 * no price were the same answer, `null`, so a shop that answered 403 still had
 * its snippet price shown beside a link that opens nothing. Four of thirty-two
 * quotes were links a traveller could not open.
 *
 * They are different facts and the caller acts differently on each: a page
 * that cannot be reached cannot be quoted at all, while one that opens and
 * says nothing may still be quoted from its snippet — marked as unverified,
 * because a price nobody can check looks identical on screen to one that was.
 */
/*
  Who this says it is, and what to do when that is refused.

  There is no one answer. Measured on 2026-10-22, twice each:

    askul.co.jp     Trippie/3.0 → 200      browser string → 403
    muji.com/jp     Trippie/3.0 → timeout  browser string → 200
    jomalone.com.tw Trippie/3.0 → 403      browser string → 200

  The two shops that publish the exact prices this list needed would not
  answer an honest introduction, and the one that answered it refuses the
  browser string. A single fixed header loses a shop whichever it picks —
  changing it to the browser string this morning fixed 無印 and Jo Malone and
  silently broke アスクル, which had been the only source of MUJI Japan's ¥390.

  So the truthful one goes first and the other is a retry, used only where
  saying who we are gets the door shut. 「Founder chose access」 is honoured
  without making deception the default.

  Either way the behaviour is the same and worth stating plainly: this opens
  pages a traveller's own shopping list named, one page per shop, a few
  seconds each, and reads the price the shop published for search engines to
  read. It does not crawl, follow links, or come back.
*/
const HONEST = 'Mozilla/5.0 (compatible; Trippie/3.0; +https://trippie-v3.onrender.com)';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface PageReading {
  /** Whether the page could be opened at all. */
  reachable: boolean;
  /** What it states about its own price, when it states anything. */
  price: PagePrice | null;
  /** Everything it says it sells, each with the name the page gave it. */
  offers: PageOffer[];
}

/**
 * Reads one product page.
 *
 * Bounded hard: five seconds and the first half-megabyte. This runs for
 * several pages while somebody watches a shopping list, and a shop that will
 * not answer promptly has answered.
 */
export const readPage = async (
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PageReading> => {
  const ask = async (agent: string): Promise<string | null> => {
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': agent, Accept: 'text/html' },
        // Half of what one page used to get, because there are now two tries.
        signal: AbortSignal.timeout(4_000),
      });
      return response.ok ? (await response.text()).slice(0, 500_000) : null;
    } catch {
      return null;
    }
  };

  const html = await ask(HONEST) ?? await ask(BROWSER);
  if (html === null) return { reachable: false, price: null, offers: [] };

  const offers = offersFromHtml(html);
  /*
    The price is returned whatever its currency. 「the page says nothing」 and
    「the page says Hong Kong dollars」 are different answers, and only the
    caller can act on the second: falling back to the snippet there would
    relabel HK$908 as NT$908.
  */
  return { reachable: true, price: priceFromHtml(html), offers };
};

/** The stated price, for callers that do not care why there is none. */
export const readPagePrice = async (
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PagePrice | null> => (await readPage(url, fetchImpl)).price;
