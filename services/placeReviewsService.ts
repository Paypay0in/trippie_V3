/**
 * What people wrote on the map about a place.
 *
 * 「沒辦法觸發Google map上的評論 或是 小紅書上的內容嗎」. The grounded lookup
 * came back empty for 佐藤養助 淺草店 — a chain with a century behind it — which
 * is the honest failure mode of a search that refuses to answer from memory.
 * The map's own reviews do not have that problem: they are first-party, they
 * are attributed, and they were written by people who went.
 *
 * Quoted rather than summarised, with the name and the rating attached. A
 * summary of five reviews is a new claim nobody made; a review with a name on
 * it is somebody's own sentence, and the reader can weigh it themselves.
 *
 * Cached for the page. Google's terms do not allow reviews to be stored, and
 * the server holds them for five minutes for the same reason.
 */
export interface PlaceReview {
  text: string;
  rating?: number;
  /** 「3 個月前」, as Google phrases it. */
  when: string;
  authorName: string;
  authorPhoto?: string;
  authorUrl?: string;
}

const cache = new Map<string, PlaceReview[]>();
const pending = new Map<string, Promise<PlaceReview[]>>();

/** For tests: the cache lives for the page, which is longer than one case. */
export const clearPlaceReviewsCache = () => { cache.clear(); pending.clear(); };

export const fetchPlaceReviews = (placeId: string): Promise<PlaceReview[]> => {
  const key = placeId.trim();
  if (!key) return Promise.resolve([]);
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;

  const request = fetch('/api/places/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeId: key }),
  })
    .then(async response => (response.ok ? await response.json() as { reviews?: unknown } : {}))
    .then(payload => (Array.isArray(payload.reviews) ? payload.reviews as Array<Record<string, unknown>> : []))
    .then(rows => rows
      .filter(row => typeof row.text === 'string' && row.text.trim())
      .map(row => ({
        text: String(row.text).trim(),
        rating: typeof row.rating === 'number' ? row.rating : undefined,
        when: typeof row.when === 'string' ? row.when : '',
        authorName: typeof row.authorName === 'string' ? row.authorName : '',
        authorPhoto: typeof row.authorPhoto === 'string' && row.authorPhoto ? row.authorPhoto : undefined,
        authorUrl: typeof row.authorUrl === 'string' && row.authorUrl ? row.authorUrl : undefined,
      })))
    .catch(() => [] as PlaceReview[])
    .then(reviews => { cache.set(key, reviews); pending.delete(key); return reviews; });

  pending.set(key, request);
  return request;
};
