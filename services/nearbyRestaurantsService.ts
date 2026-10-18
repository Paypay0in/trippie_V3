/**
 * The client half of 「找三間附近的餐廳問使用者」.
 *
 * One request per restaurant being replaced, cached for the life of the page:
 * the preview can be opened and closed repeatedly while somebody decides, and
 * re-asking Google each time spends quota to learn the same thing.
 */
export interface NearbyRestaurant {
  placeId: string;
  placeName: string;
  latitude: number;
  longitude: number;
  rating?: number;
  ratingCount?: number;
  /** 拉麵店, 壽司店 — what kind of restaurant. */
  kind?: string;
}

const cache = new Map<string, Promise<NearbyRestaurant[]>>();

/** Four decimal places is about ten metres — the same corner, not the same point. */
const keyOf = (latitude: number, longitude: number) =>
  `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

export const clearNearbyRestaurantsCache = () => cache.clear();

export const fetchNearbyRestaurants = (
  latitude: number,
  longitude: number,
): Promise<NearbyRestaurant[]> => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Promise.resolve([]);
  const key = keyOf(latitude, longitude);
  const existing = cache.get(key);
  if (existing) return existing;

  const request = fetch('/api/places/nearby-restaurants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude }),
  })
    .then(async response => (response.ok
      ? ((await response.json()) as { restaurants?: NearbyRestaurant[] }).restaurants || []
      : []))
    // An offer beside a warning: a failure is simply no offer.
    .catch(() => []);

  cache.set(key, request);
  return request;
};
