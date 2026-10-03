/**
 * What is known about a place the traveller saved nothing about.
 *
 * 「這個你要基本查一些資訊 不能讓這個行程空白」. A screenshot that named 다고소님 and
 * nothing else produced a card with a name and an empty space beneath it. An
 * empty space says nothing about the place and reads like a failure.
 *
 * Every field here comes back from Google about that exact place id — its kind,
 * its own one-line description, its hours, its rating. None of it is written by
 * a model: a plausible sentence about a restaurant nobody checked is worse than
 * the blank it replaced, because it cannot be told apart from one that is true.
 *
 * Mirrors placePhotoService: one request per place, cached, and every failure
 * resolves to null. This is enrichment — it must never block a card from
 * rendering or a list from loading.
 */

export interface PlaceBasics {
  /** 「咖啡廳」, 「韓式料理」 — Google's own category for the place. */
  kind?: string;
  /** Google's one-line description, where it has one. */
  summary?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  openNow?: boolean;
  /** Seven lines, Monday first, as Google phrases them. */
  weekdayHours?: string[];
  website?: string;
}

const cache = new Map<string, PlaceBasics | null>();
const pending = new Map<string, Promise<PlaceBasics | null>>();

/** Exposed for tests; the app never needs to clear the cache. */
export const clearPlaceBasicsCache = () => { cache.clear(); pending.clear(); };

const text = (value: unknown): string | undefined =>
  (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const positive = (value: unknown): number | undefined =>
  (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);

/**
 * Keeps only what can be shown as a fact.
 *
 * A rating with no count behind it is dropped: 「★5.0」 from one review is a
 * number that misleads more than it informs.
 */
export const normalizePlaceBasics = (value: unknown): PlaceBasics | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const ratingCount = positive(source.ratingCount);

  const basics: PlaceBasics = {
    kind: text(source.kind),
    summary: text(source.summary),
    rating: ratingCount ? positive(source.rating) : undefined,
    ratingCount,
    priceLevel: text(source.priceLevel),
    businessStatus: text(source.businessStatus),
    openNow: typeof source.openNow === 'boolean' ? source.openNow : undefined,
    weekdayHours: Array.isArray(source.weekdayHours)
      ? (source.weekdayHours as unknown[]).filter((line): line is string => typeof line === 'string' && Boolean(line.trim()))
      : undefined,
    website: text(source.website),
  };

  return Object.values(basics).some(entry => entry !== undefined && (!Array.isArray(entry) || entry.length > 0))
    ? basics
    : null;
};

export const fetchPlaceBasics = async (placeId?: string): Promise<PlaceBasics | null> => {
  const id = placeId?.trim();
  // Without a resolved place there is nothing to look up: a name alone could be
  // any of several branches, and guessing which would be worse than the blank.
  if (!id) return null;
  if (cache.has(id)) return cache.get(id) ?? null;
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const response = await fetch('/api/places/basics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: id }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { basics?: unknown };
      return normalizePlaceBasics(payload?.basics);
    } catch {
      return null;
    }
  })();

  pending.set(id, request);
  const result = await request;
  pending.delete(id);
  cache.set(id, result);
  return result;
};

const PRICE_LABELS: Record<string, string> = {
  PRICE_LEVEL_FREE: '免費',
  PRICE_LEVEL_INEXPENSIVE: '平價',
  PRICE_LEVEL_MODERATE: '中價位',
  PRICE_LEVEL_EXPENSIVE: '高價位',
  PRICE_LEVEL_VERY_EXPENSIVE: '高級',
};

/**
 * The one line a list row can carry.
 *
 * Kind first, because 「這是什麼」 is the question an unfamiliar Korean name
 * leaves open. Hours are left out: a row is read while scrolling, and 「今天幾點
 * 關」 is a question for the card, where there is room to be exact.
 */
export const summarizePlaceBasics = (basics: PlaceBasics | null): string => {
  if (!basics) return '';
  if (basics.businessStatus === 'CLOSED_PERMANENTLY') return '已永久歇業';

  const parts = [
    basics.kind,
    basics.rating && basics.ratingCount ? `★ ${basics.rating.toFixed(1)}（${basics.ratingCount.toLocaleString()}）` : '',
    basics.priceLevel ? PRICE_LABELS[basics.priceLevel] || '' : '',
  ].filter(Boolean);

  return parts.join(' · ');
};

/** Today's hours, as Google phrases them. Monday is index 0 in their list. */
export const hoursForToday = (basics: PlaceBasics | null, now: Date = new Date()): string | undefined => {
  const lines = basics?.weekdayHours;
  if (!lines || lines.length < 7) return undefined;
  // getDay() is Sunday-first; Google's list is Monday-first.
  const index = (now.getDay() + 6) % 7;
  return lines[index];
};
