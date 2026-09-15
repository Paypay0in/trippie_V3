export type PlacePhoto = {
  imageUrl: string;
  attribution?: { displayName?: string; uri?: string };
};

const cache = new Map<string, PlacePhoto | null>();
const pending = new Map<string, Promise<PlacePhoto | null>>();

export const fetchPlacePhoto = (placeId: string): Promise<PlacePhoto | null> => {
  const cached = cache.get(placeId);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(placeId);
  if (existing) return existing;
  const request = fetch('/api/places/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId }) })
    .then(async response => response.ok ? await response.json() as { photo?: PlacePhoto | null } : { photo: null })
    .then(result => result.photo || null)
    .catch(() => null)
    .then(photo => { cache.set(placeId, photo); pending.delete(placeId); return photo; });
  pending.set(placeId, request);
  return request;
};
