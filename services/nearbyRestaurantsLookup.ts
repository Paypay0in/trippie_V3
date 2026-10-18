/**
 * Restaurants near a point, for replacing one that costs a detour.
 *
 * 「或是 Ai 搜尋後推薦結果出現三個問用戶嗎」 — and the answer uses Places rather
 * than a language model. 「What restaurants are near 35.70, 139.79」 is a
 * lookup: Places returns venues that exist, with coordinates, a rating and a
 * count. A model returns sentences about venues, some of which exist.
 *
 * Same rule the rest of this codebase settled on today: facts are fetched and
 * prose is generated, and this is a fact.
 */
import type { Express } from 'express';

export interface NearbyRestaurant {
  placeId: string;
  placeName: string;
  latitude: number;
  longitude: number;
  rating?: number;
  ratingCount?: number;
}

/**
 * How many ratings a place needs before it is worth suggesting.
 *
 * Ranked by popularity, the first page still carries places with three
 * reviews. 「Nearest」 is not a recommendation, and neither is 「5.0 from three
 * people」 — this is replacing somewhere the traveller chose on purpose, so the
 * bar is 「somewhere plenty of people have actually been」.
 */
export const ENOUGH_RATINGS = 50;

interface PlacesResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
  }>;
}

export const readNearbyRestaurants = (body: unknown): NearbyRestaurant[] =>
  ((body as PlacesResponse)?.places || [])
    .filter(place => (place.userRatingCount || 0) >= ENOUGH_RATINGS)
    .flatMap(place => {
      const placeId = typeof place.id === 'string' ? place.id.trim() : '';
      const placeName = place.displayName?.text?.trim() || '';
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      if (!placeId || !placeName
        || typeof latitude !== 'number' || typeof longitude !== 'number') return [];
      return [{
        placeId,
        placeName,
        latitude,
        longitude,
        ...(typeof place.rating === 'number' ? { rating: place.rating } : {}),
        ...(typeof place.userRatingCount === 'number' ? { ratingCount: place.userRatingCount } : {}),
      }];
    });

type Fetcher = typeof fetch;

/**
 * Mounts the route. Extracted so a test can exercise the identical handler.
 *
 * Bounded hard: one request, a short timeout, and a failure is an empty list
 * rather than an error — this is an offer beside a warning, and a warning that
 * breaks because an offer could not be computed is worse than no offer.
 */
export const registerNearbyRestaurantsRoute = (
  app: Express,
  deps: { googleApiKey?: () => string | undefined; fetchImpl?: Fetcher } = {},
) => {
  app.post('/api/places/nearby-restaurants', async (req, res) => {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const radius = Math.min(Math.max(Number(req.body?.radiusMetres) || 700, 200), 2_000);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
      || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      res.json({ restaurants: [] });
      return;
    }

    const apiKey = deps.googleApiKey?.() ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.json({ restaurants: [] }); return; }

    try {
      const call = deps.fetchImpl ?? fetch;
      const response = await call('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
          includedPrimaryTypes: ['restaurant'],
          maxResultCount: 15,
          // Popularity, not distance: ranked by distance the first page is
          // whatever happens to be on that street corner.
          rankPreference: 'POPULARITY',
          languageCode: 'zh-TW',
          locationRestriction: { circle: { center: { latitude, longitude }, radius } },
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) { res.json({ restaurants: [] }); return; }
      res.json({ restaurants: readNearbyRestaurants(await response.json()) });
    } catch {
      res.json({ restaurants: [] });
    }
  });
};
