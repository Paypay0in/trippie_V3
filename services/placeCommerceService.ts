import { PlaceBookingOption, PlaceCommerceInfo } from '../types';
import { validateBookingUrlShape } from './bookingUrlValidation';

/**
 * Ticket / booking lookup for an itinerary place.
 *
 * Mirrors placePhotoService: one request per place, cached in memory, and every
 * failure resolves to null rather than throwing. Commerce is optional enrichment,
 * so nothing here may ever block the itinerary rendering, loading or persisting.
 *
 * Provider-specific knowledge lives behind /api/places/commerce. The client never
 * talks to a booking platform and never scrapes one.
 */

export interface PlaceCommerceQuery {
  /** Canonical Google identity, preferred whenever the item has one. */
  placeId?: string;
  placeName: string;
  city?: string;
  country?: string;
}

/** Cache key built from canonical identity first, falling back to name + place. */
export const commerceCacheKey = (query: PlaceCommerceQuery): string =>
  query.placeId?.trim()
    ? `place:${query.placeId.trim()}`
    : `name:${[query.placeName, query.city, query.country].map(part => (part || '').trim().toLocaleLowerCase()).join('|')}`;

const cache = new Map<string, PlaceCommerceInfo | null>();
const pending = new Map<string, Promise<PlaceCommerceInfo | null>>();

/** Exposed for tests; the app never needs to clear the cache. */
export const clearPlaceCommerceCache = () => { cache.clear(); pending.clear(); };

const isValidUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Keeps only what can be shown honestly.
 *
 * A booking option without a real URL is dropped rather than rendered as a dead
 * button, and a price is kept only when it is a finite positive number with a
 * currency. Anything partial degrades to "no price", which the card renders as
 * 查看最新票價 — never as a fabricated figure.
 */
export const normalizePlaceCommerce = (value: unknown): PlaceCommerceInfo | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;

  // The server validates these, and the client validates them again: a booking
  // button is the one thing here the user can actually click, so the rules are
  // enforced on both sides of the wire rather than trusted across it.
  const bookingOptions: PlaceBookingOption[] = Array.isArray(source.bookingOptions)
    ? source.bookingOptions
        .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
        .filter(entry => typeof entry.label === 'string' && Boolean(entry.label.trim()))
        // A link with no declared urlType cannot be labelled honestly, so it is
        // not rendered at all rather than guessed at.
        .filter(entry => entry.urlType === 'direct' || entry.urlType === 'search')
        .filter(entry => {
          const provider = typeof entry.provider === 'string' && entry.provider.trim() ? entry.provider.trim() : 'other';
          return typeof entry.url === 'string' && validateBookingUrlShape(provider, entry.url).ok;
        })
        .map(entry => ({
          provider: typeof entry.provider === 'string' && entry.provider.trim() ? entry.provider.trim() : 'other',
          label: (entry.label as string).trim(),
          url: (entry.url as string).trim(),
          urlType: entry.urlType as PlaceBookingOption['urlType'],
          ...(typeof entry.verifiedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedAt)
            ? { verifiedAt: entry.verifiedAt }
            : {}),
        }))
    : [];

  const rawPrice = source.officialPrice && typeof source.officialPrice === 'object'
    ? source.officialPrice as Record<string, unknown>
    : undefined;
  // Every one of these is load-bearing. A number without attribution and a check
  // date cannot be shown as 官方參考價, so a partial price degrades to no price
  // and the card falls back to 查看最新票價.
  const officialPrice = rawPrice
    && typeof rawPrice.amount === 'number' && Number.isFinite(rawPrice.amount) && rawPrice.amount > 0
    && typeof rawPrice.currency === 'string' && rawPrice.currency.trim()
    && typeof rawPrice.sourceName === 'string' && rawPrice.sourceName.trim()
    && isValidUrl(rawPrice.sourceUrl)
    && typeof rawPrice.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawPrice.checkedAt)
    ? {
        amount: rawPrice.amount,
        currency: rawPrice.currency.trim().toUpperCase(),
        sourceName: rawPrice.sourceName.trim(),
        sourceUrl: rawPrice.sourceUrl.trim(),
        checkedAt: rawPrice.checkedAt,
        ...(typeof rawPrice.label === 'string' && rawPrice.label.trim() ? { label: rawPrice.label.trim() } : {}),
      }
    : undefined;

  const notes = Array.isArray(source.notes)
    ? source.notes.filter((note): note is string => typeof note === 'string' && Boolean(note.trim())).map(note => note.trim())
    : [];

  const info: PlaceCommerceInfo = {
    ...(typeof source.admissionRequired === 'boolean' ? { admissionRequired: source.admissionRequired } : {}),
    ...(officialPrice ? { officialPrice } : {}),
    ...(source.priceStale === true && !officialPrice ? { priceStale: true } : {}),
    ...(bookingOptions.length > 0 ? { bookingOptions } : {}),
    ...(notes.length > 0 ? { notes } : {}),
    ...(typeof source.lastCheckedAt === 'string' && source.lastCheckedAt.trim() ? { lastCheckedAt: source.lastCheckedAt.trim() } : {}),
  };

  // An object that says nothing is not worth a section on the card.
  return Object.keys(info).length > 0 ? info : null;
};

/**
 * Whether the card should render the 門票 / 預約 section at all.
 *
 * A place explicitly known to need no admission — a beach, a public park — renders
 * nothing, and so does a place we simply know nothing useful about. The section
 * only appears when there is something real to say.
 */
export const hasDisplayableCommerce = (info: PlaceCommerceInfo | null | undefined): boolean => {
  if (!info) return false;
  if (info.admissionRequired === false) return false;
  return Boolean(info.admissionRequired || info.officialPrice || info.bookingOptions?.length);
};

export const fetchPlaceCommerce = (query: PlaceCommerceQuery): Promise<PlaceCommerceInfo | null> => {
  if (!query.placeName?.trim() && !query.placeId?.trim()) return Promise.resolve(null);
  const key = commerceCacheKey(query);

  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = fetch('/api/places/commerce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      placeId: query.placeId?.trim() || undefined,
      placeName: query.placeName?.trim(),
      city: query.city?.trim() || undefined,
      country: query.country?.trim() || undefined,
    }),
  })
    .then(async response => (response.ok ? await response.json() as { commerce?: unknown } : { commerce: null }))
    .then(result => normalizePlaceCommerce(result.commerce))
    .catch(() => null)
    .then(info => { cache.set(key, info); pending.delete(key); return info; });

  pending.set(key, request);
  return request;
};
