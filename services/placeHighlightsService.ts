/**
 * What a place is known for, looked up rather than remembered.
 *
 * 「像收藏了這間店 但沒有相關旅行筆記 可以讓AI爬文看這間店有名的是什麼嗎？」 — a
 * place saved from a map link has an address, a rating and a category, and
 * nothing a person would actually tell you about it.
 *
 * Asked for only when somebody presses the button. 「有名的是什麼」 is a search
 * per place, and a collection of fifty opened one after another is fifty
 * searches to fill cards nobody read.
 *
 * Cached for the page like `placePhotoService`, so closing a card and opening
 * it again costs nothing. An empty answer is cached too: a place the search
 * found nothing about will find nothing about it a second time, and asking
 * again on every open is how a free screen becomes an expensive one.
 */
export interface PlaceHighlightSource {
  title: string;
  url: string;
}

export interface PlaceHighlights {
  points: string[];
  /** The pages the points were read off. Empty means nothing was read. */
  sources: PlaceHighlightSource[];
}

const EMPTY: PlaceHighlights = { points: [], sources: [] };

const cache = new Map<string, PlaceHighlights>();
const pending = new Map<string, Promise<PlaceHighlights>>();

/** For tests: the cache lives for the page, which is longer than one case. */
export const clearPlaceHighlightsCache = () => { cache.clear(); pending.clear(); };

const asStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

export const fetchPlaceHighlights = (
  place: { placeId?: string; placeName: string; address?: string; city?: string },
): Promise<PlaceHighlights> => {
  const key = place.placeId?.trim() || `${place.placeName}|${place.address ?? ''}`;
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = fetch('/api/places/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeName: place.placeName, address: place.address, city: place.city }),
  })
    .then(async response => (response.ok ? await response.json() as Record<string, unknown> : {}))
    .then(payload => ({
      points: asStrings(payload.points),
      sources: Array.isArray(payload.sources)
        ? (payload.sources as Array<Record<string, unknown>>)
          .filter(source => typeof source?.url === 'string' && source.url)
          .map(source => ({ title: String(source.title ?? ''), url: String(source.url) }))
        : [],
    }))
    /*
      Nothing read means nothing claimed. The server already refuses to answer
      from memory, and this is the second place that rule is enforced, because
      the consequence of getting it wrong — a signature dish at a restaurant
      that never served it — reads exactly like a real one.
    */
    .then(result => (result.sources.length > 0 ? result : EMPTY))
    .catch(() => EMPTY)
    .then(result => { cache.set(key, result); pending.delete(key); return result; });

  pending.set(key, request);
  return request;
};
