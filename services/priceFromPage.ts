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
 * `offers` is whatever the shop felt like: one object, a list of them, or an
 * `AggregateOffer` with a low and a high. The low is the one a traveller is
 * being quoted — the high is the gift set.
 */
const fromOffers = (offers: unknown): PagePrice | null => {
  if (Array.isArray(offers)) {
    const found = offers.map(fromOffers).filter((price): price is PagePrice => price !== null);
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
  return { amount, currency };
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

/**
 * Structured data first, meta tags second.
 *
 * Both are the shop's own statement rather than a reading of its page, and a
 * shop that publishes neither is a shop this cannot help with.
 */
export const priceFromHtml = (html: string): PagePrice | null => {
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    for (const node of walk(parsed)) {
      const found = fromOffers(node.offers);
      if (found) return found;
    }
  }

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
  return amount !== null && currency ? { amount, currency } : null;
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
export interface PageReading {
  /** Whether the page could be opened at all. */
  reachable: boolean;
  /** What it states about its own price, when it states anything. */
  price: PagePrice | null;
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
  try {
    const response = await fetchImpl(url, {
      headers: {
        // Several storefronts serve a stub to anything that does not look
        // like a browser, and a stub has no price in it.
        'User-Agent': 'Mozilla/5.0 (compatible; Trippie/3.0; +https://trippie-v3.onrender.com)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { reachable: false, price: null };
    const html = (await response.text()).slice(0, 500_000);
    /*
      The price is returned whatever its currency. 「the page says nothing」
      and 「the page says Hong Kong dollars」 are different answers, and only
      the caller can act on the second: falling back to the snippet there
      would relabel HK$908 as NT$908.
    */
    return { reachable: true, price: priceFromHtml(html) };
  } catch {
    return { reachable: false, price: null };
  }
};

/** The stated price, for callers that do not care why there is none. */
export const readPagePrice = async (
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PagePrice | null> => (await readPage(url, fetchImpl)).price;
