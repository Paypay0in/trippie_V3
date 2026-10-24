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
  /**
   * Whether the page sells the product on the list, and how sure that is.
   *
   * Absent means nothing checked — a snippet is a number beside a title, and
   * the title was never compared with anything.
   */
  match?: 'exact' | 'probable';
  /** Why, in words. Shown beside a probable match. */
  matchReason?: string;
  /**
   * How many the listing sells at once, when it sells more than one.
   *
   * 「這個到底為何會給三個的價格」 — 爽快ドラッグ's ¥2,293 is 「45ml*3個セット」,
   * which is a true price for three bottles printed beside 台灣's price for
   * one. Carried rather than divided: a multipack is usually discounted, so
   * a divided figure is a price the shop does not offer. The screen says
   * 「3入組」 and the traveller does the rest.
   */
  packSize?: number;
  /**
   * Whether the figure was read off the page rather than its structured data.
   *
   * 「我還是覺得找價格能力要更強」 — eleven of eighteen failures were pages that
   * opened, matched, and published no machine-readable price: 香奈兒, 安耐曬,
   * 雪肌精, CANMAKE all write the number for people and not for crawlers.
   * Reading it is worth doing and is a weaker statement than structured data,
   * so it says so rather than being printed as the same kind of fact.
   */
  priceFromText?: boolean;
}

/** Why a country has no price, when it has none. */
export type CountryPriceStatus =
  /** A checked price. */
  | 'ok'
  /** Shops found, and what they price is a different product. */
  | 'no_match'
  /** Product pages found, and none of them publishes a price. */
  | 'found_no_price'
  /** Nothing the search returned was a shop selling anything like it. */
  | 'not_found'
  /** The search provider's allowance is spent. Not the product's fault. */
  | 'quota_exceeded'
  /** The search provider refused or failed for some other reason. */
  | 'search_unavailable';

export interface PriceCheck {
  quotes: PriceQuote[];
  /**
   * Per country, why it looks the way it does.
   *
   * 「The UI should not collapse every failure into 沒查到」 — shops found and
   * none of them saying what this costs sends a traveller to go and look;
   * nothing matching the search at all tells them to check the name.
   */
  byCountry?: Record<string, CountryPriceStatus>;
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

/**
 * What was already looked up, kept on the device.
 *
 * It used to live for the page, which meant every reopen of the list asked
 * again for sixteen products in two countries — and every deploy of the
 * server wiped its cache too, so a day of releases cost a day of lookups.
 * At $5 per thousand searches that is a real number, and none of it bought
 * an answer anybody did not already have.
 *
 * Three days, because a shop's price is not a fact about this afternoon.
 * Each row still carries 「{date} 查到的價格，僅供參考」, and 重新查價 is the
 * one thing that ignores all of this — which is what that button is for.
 *
 * Per device rather than per trip: the server has no database connection at
 * all, and giving it one means a service key, a table and a migration for a
 * cache. This buys most of the same saving for none of that.
 */
/**
 * 「你是不是要清快取」. Yes — and not by hand, every time.
 *
 * Within two hours of the cache shipping, four changes landed that alter what
 * a price check answers: the destination's own word for the thing, the flea
 * market refused, 「3入組」, and one of those three being wrong. Every device
 * that had looked at the list was holding the old answers for three days and
 * would go on showing them, with no sign that they predated the fix. A
 * traveller cannot know to press 重新查價 for something they cannot see.
 *
 * So what was stored is stamped with the reading that produced it. A build
 * that changes the reading leaves every earlier entry unreadable, and the
 * next open asks again — once, and then the three days resume.
 *
 * Bump this whenever a change alters what a check returns for the same
 * product. It costs one round of searches and buys never having to tell
 * somebody their screen is stale.
 */
const READING = 'v9-queries';
export const PRICE_CACHE_KEY = `trippie_price_cache:${READING}`;
const CACHE_KEY = PRICE_CACHE_KEY;
const CACHE_MS = 3 * 24 * 60 * 60 * 1000;
/** Enough for several trips' lists; beyond that the oldest go. */
const CACHE_MAX = 300;

interface StoredCheck { at: number; value: PriceCheck }

const cache = new Map<string, PriceCheck>();
const pending = new Map<string, Promise<PriceCheck>>();
const storedAt = new Map<string, number>();

const readStore = (): Record<string, StoredCheck> => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, StoredCheck> : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store: Record<string, StoredCheck>) => {
  try {
    const live = Object.entries(store)
      .filter(([, held]) => Date.now() - held.at < CACHE_MS)
      .sort(([, left], [, right]) => right.at - left.at)
      .slice(0, CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(live)));
  } catch {
    /* A full device keeps working; it simply looks things up again. */
  }
};

/**
 * What earlier readings left behind.
 *
 * Stamping the key makes stale answers unreadable, which is the point, but
 * unreadable is not gone: the old entries would sit in localStorage taking
 * up a device's quota for a cache nothing will ever read again.
 */
const sweepOldReadings = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith('trippie_price_cache') && key !== CACHE_KEY) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* A device that will not let us tidy still works. */
  }
};

/** Everything still fresh, read once when the module loads. */
const hydrate = () => {
  if (typeof localStorage === 'undefined') return;
  sweepOldReadings();
  Object.entries(readStore()).forEach(([key, held]) => {
    if (!held || typeof held.at !== 'number') return;
    if (Date.now() - held.at >= CACHE_MS) return;
    if (!held.value || !Array.isArray(held.value.quotes)) return;
    cache.set(key, held.value);
    storedAt.set(key, held.at);
  });
};
hydrate();

const remember = (key: string, value: PriceCheck) => {
  const at = Date.now();
  cache.set(key, value);
  storedAt.set(key, at);
  if (typeof localStorage === 'undefined') return;
  writeStore({ ...readStore(), [key]: { at, value } });
};

const forget = (key: string) => {
  cache.delete(key);
  storedAt.delete(key);
  if (typeof localStorage === 'undefined') return;
  const store = readStore();
  delete store[key];
  writeStore(store);
};

/** For tests, and for 清除快取: the device forgets everything it looked up. */
export const clearPriceCheckCache = () => {
  cache.clear();
  pending.clear();
  storedAt.clear();
  try { localStorage.removeItem(CACHE_KEY); } catch { /* nothing to clear */ }
};

const EMPTY: PriceCheck = { quotes: [], readAt: '' };

export const checkPrices = (product: {
  name: string;
  brand?: string;
  /** Where the trip is, as an ISO code. */
  destinationCountry?: string;
  /** Where it is being compared against. */
  homeCountry?: string;
  /**
   * Somebody pressed 重新查價 for this one row.
   *
   * Opening a list is sixteen rows at once and happens all day; this is one
   * row and happens when the answer looked wrong. It skips the cache and
   * spends the extra ways of asking that an ordinary open must not.
   */
  refresh?: boolean;
}): Promise<PriceCheck> => {
  /*
    The pair is part of the key. The same bottle compared 日本/台灣 and
    日本/香港 are two different questions, and answering the second from the
    first's cache is how a Hong Kong price appears under 台灣價格.
  */
  const key = [product.name, product.brand ?? '', product.destinationCountry ?? '', product.homeCountry ?? '']
    .join('|').toLocaleLowerCase();
  if (product.refresh) { forget(key); pending.delete(key); }
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
      ...(product.refresh ? { refresh: true } : {}),
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
      ...(payload.byCountry && typeof payload.byCountry === 'object'
        ? { byCountry: payload.byCountry as Record<string, CountryPriceStatus> }
        : {}),
      ...(typeof payload.error === 'string' ? { error: payload.error } : {}),
    }))
    .catch(() => ({ ...EMPTY, error: '現在查不到價格。' }))
    /*
      A failure is not cached. 「今天用完了」 becomes false tomorrow, and a
      cached refusal would outlive the thing that caused it.
    */
    .then(result => { if (!result.error) remember(key, result); pending.delete(key); return result; });

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
