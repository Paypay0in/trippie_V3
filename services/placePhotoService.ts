export type PlacePhoto = {
  imageUrl: string;
  attribution?: { displayName?: string; uri?: string };
};

const cache = new Map<string, PlacePhoto[]>();
const pending = new Map<string, Promise<PlacePhoto[]>>();

/** For tests: the cache lives for the page, which is longer than one case. */
export const clearPlacePhotoCache = () => { cache.clear(); pending.clear(); };

/**
 * Every photo Google holds for a place, up to the six the server returns.
 *
 * 「我預期點擊下去應該是這樣」 — the card that opens a place shows a gallery, and
 * the same request has always carried the whole set; only the first was ever
 * read. Cached as the list so the thumbnail a list drew and the gallery a card
 * opens are one request, not two.
 */
export const fetchPlacePhotos = (placeId: string): Promise<PlacePhoto[]> => {
  const cached = cache.get(placeId);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(placeId);
  if (existing) return existing;
  const request = fetch('/api/places/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId }) })
    .then(async response => response.ok
      ? await response.json() as { photo?: PlacePhoto | null; photos?: PlacePhoto[] }
      : {})
    // A server that only knows the old shape still answers with one photo.
    .then(result => result.photos?.length ? result.photos : (result.photo ? [result.photo] : []))
    .catch(() => [] as PlacePhoto[])
    .then(photos => { cache.set(placeId, photos); pending.delete(placeId); return photos; });
  pending.set(placeId, request);
  return request;
};

export const fetchPlacePhoto = (placeId: string): Promise<PlacePhoto | null> =>
  fetchPlacePhotos(placeId).then(photos => photos[0] ?? null);
