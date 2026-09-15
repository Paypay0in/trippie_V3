import type { Express } from 'express';
import {
  buildCuratedCommerce,
  classifyPlaceTypes,
  commerceNameKey,
  CuratedCommerceEntry,
  CuratedPriceSource,
  findCuratedCommerce,
} from './placeCommerceCatalogue';
import { DeclaredBookingLink, validateBookingLinks } from './bookingUrlValidation';

/**
 * Server-side venue-commerce lookup boundary.
 *
 * This is the only place that fetches an external page for a price, and it will
 * only ever fetch a URL a human put in the catalogue. It is deliberately not a
 * crawler: it follows no links, reads one page, and gives up quickly.
 *
 * The number is never written by hand. A catalogue entry supplies *where* to look
 * and what shape the figure has; the amount itself is read from the operator's own
 * page at request time, which is what makes `checkedAt` meaningful. If the page
 * moves, changes shape, or is slow, the result is simply no price — the card then
 * says 查看最新票價, which is always true.
 */

/** One page read, bounded hard. A price is never worth hanging a card on. */
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BYTES = 512 * 1024;

export interface FetchedPrice {
  amount: number;
  currency: string;
  label?: string;
  sourceName: string;
  sourceUrl: string;
  checkedAt: string;
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; text: () => Promise<string> }>;
/** Booking-link reachability uses only the status, so it has its own shape. */
type LinkFetcher = (url: string, init?: { method?: string; redirect?: string; signal?: AbortSignal }) => Promise<{ status: number; url?: string }>;

const todayIso = (now: Date = new Date()) => now.toISOString().slice(0, 10);

/**
 * Pulls the figure out of a page.
 *
 * The entry's own regex decides what counts, because only a human who looked at
 * the page knows which of its numbers is the admission price. The first capture
 * group must be the amount; anything that does not parse to a positive number is
 * treated as no match rather than coerced.
 */
export const extractPrice = (html: string, source: CuratedPriceSource): number | undefined => {
  const pattern = new RegExp(source.pattern, source.patternFlags || 'i');
  const match = pattern.exec(html);
  if (!match) return undefined;
  const raw = (match[1] ?? '').replace(/[\s,]/g, '');
  if (!/^\d+$/.test(raw)) return undefined;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  // A sanity ceiling: a page full of markup can otherwise yield an absurd figure.
  return amount <= source.maxPlausibleAmount ? amount : undefined;
};

/**
 * Reads one human-verified page and returns the price it states.
 * Every failure mode — network, HTTP, size, shape — yields undefined, never a guess.
 */
export const fetchOfficialPrice = async (
  source: CuratedPriceSource,
  deps: { fetch?: Fetcher; now?: Date } = {},
): Promise<FetchedPrice | undefined> => {
  const doFetch = deps.fetch || (globalThis.fetch as unknown as Fetcher);
  if (!doFetch) return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await doFetch(source.url, { signal: controller.signal });
    if (!response.ok) return undefined;
    const body = await response.text();
    if (body.length > MAX_BYTES) return undefined;

    const amount = extractPrice(body, source);
    if (amount === undefined) return undefined;

    return {
      amount,
      currency: source.currency,
      label: source.label,
      sourceName: source.sourceName,
      sourceUrl: source.url,
      // The price was read from the operator's page just now; that is the date.
      checkedAt: todayIso(deps.now),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

export interface PlaceDetailsForCommerce {
  types?: string[];
  websiteUri?: string;
}

/**
 * The whole decision for one place, with no Express or Google coupling, so it can
 * be driven directly in a test.
 */
export const resolvePlaceCommerce = async (
  input: { placeId?: string; placeName: string; details?: PlaceDetailsForCommerce },
  deps: { fetch?: Fetcher; now?: Date; catalogue?: CuratedCommerceEntry[]; skipNetwork?: boolean; linkFetch?: LinkFetcher } = {},
): Promise<{ commerce: unknown; ttlMs: number }> => {
  const curated = findCuratedCommerce(input.placeId, input.placeName, deps.catalogue);

  if (curated) {
    // A curated entry that names a price page gets a live read. One that does not
    // is still a useful entry — it establishes that a ticket is needed.
    const livePrice = curated.priceSource
      ? await fetchOfficialPrice(curated.priceSource, deps)
      : undefined;
    const built = buildCuratedCommerce(curated, input.placeName, livePrice);
    return {
      commerce: {
        ...built,
        bookingOptions: await validateBookingLinks(built.bookingOptions as DeclaredBookingLink[], deps),
      },
      ttlMs: 6 * 60 * 60_000,
    };
  }

  const verdict = classifyPlaceTypes(input.details?.types);
  if (verdict === 'free') return { commerce: { admissionRequired: false }, ttlMs: 24 * 60 * 60_000 };
  if (verdict === 'unknown') return { commerce: null, ttlMs: 6 * 60 * 60_000 };

  // The venue's own site as Google records it — declared by the operator, not
  // inferred from the place name. No provider links: this layer has none to
  // declare, and it will not invent any.
  const declared: DeclaredBookingLink[] = typeof input.details?.websiteUri === 'string'
    ? [{ provider: 'official', label: '官方網站', url: input.details.websiteUri, urlType: 'direct' }]
    : [];

  return {
    commerce: {
      admissionRequired: true,
      // This layer establishes only that a ticket is needed, never its price.
      bookingOptions: await validateBookingLinks(declared, deps),
    },
    ttlMs: 6 * 60 * 60_000,
  };
};

/**
 * Mounts the route. Extracted from server.ts so a test can mount the identical
 * handler on a real HTTP server — the gap that let a 404'd route ship twice.
 */
export const registerPlaceCommerceRoute = (
  app: Express,
  deps: {
    googleApiKey?: () => string | undefined;
    fetch?: Fetcher;
    now?: Date;
    catalogue?: CuratedCommerceEntry[];
    skipNetwork?: boolean;
    linkFetch?: LinkFetcher;
  } = {},
) => {
  const cache = new Map<string, { expiresAt: number; value: unknown }>();

  app.post('/api/places/commerce', async (req, res) => {
    const placeId = typeof req.body?.placeId === 'string' ? req.body.placeId.trim() : '';
    const placeName = typeof req.body?.placeName === 'string' ? req.body.placeName.trim() : '';
    if ((!placeName && !placeId) || placeName.length > 160) { res.json({ commerce: null }); return; }

    const cacheKey = placeId ? `place:${placeId}` : `name:${commerceNameKey(placeName)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) { res.json({ commerce: cached.value }); return; }

    try {
      // Google details are only consulted when the catalogue has nothing, which
      // keeps a curated place from spending quota it does not need.
      let details: PlaceDetailsForCommerce | undefined;
      const apiKey = deps.googleApiKey?.() ?? process.env.GOOGLE_MAPS_API_KEY;
      const needsDetails = !findCuratedCommerce(placeId, placeName, deps.catalogue);
      if (needsDetails && placeId && apiKey) {
        const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
          headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'id,types,websiteUri' },
          signal: AbortSignal.timeout(5_000),
        });
        if (response.ok) details = await response.json() as PlaceDetailsForCommerce;
      }

      const { commerce, ttlMs } = await resolvePlaceCommerce({ placeId, placeName, details }, deps);
      cache.set(cacheKey, { expiresAt: Date.now() + ttlMs, value: commerce });
      res.json({ commerce });
    } catch {
      // Commerce is optional enrichment: a failure is a quiet null, never a 500.
      cache.set(cacheKey, { expiresAt: Date.now() + 60_000, value: null });
      res.json({ commerce: null });
    }
  });
};
