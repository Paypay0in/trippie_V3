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
  /**
   * What kind of restaurant it is, in the app's language: 拉麵店, 壽司店,
   * 日式炸豬排餐廳.
   *
   * 「告訴我是哪類餐廳」 — and Google answers it in the same request. 「結
   * Yuwaeru 本店」 is a name; 「日式餐廳」 is what somebody actually needs to know
   * before choosing it for dinner.
   */
  kind?: string;
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

/**
 * What to look for, decided by the slot being filled.
 *
 * 「若不是在編輯吃東西的時段時 推薦就不要是食物」 — the 15:30 下午行程 block was
 * offered three Korean restaurants, because this route only ever asked for
 * restaurants. An afternoon is not a meal, and 「the most popular restaurant
 * near here」 is the wrong answer to a question nobody asked.
 *
 * The saved-place suggestions already worked this way (`suggestionsForSlot`
 * leads a meal with food and an activity with sights). Google's half did not —
 * the same two-paths-one-does-less shape as the rest of today.
 *
 * Google's own place types, so nothing is invented: a 類型 that does not exist
 * returns an error and the offer silently disappears.
 */
export const LOOKING_FOR: Record<'food' | 'activity', string[]> = {
  food: ['restaurant'],
  activity: [
    'tourist_attraction',
    'museum',
    'art_gallery',
    'park',
    'shopping_mall',
    'department_store',
  ],
};

interface PlacesResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    primaryTypeDisplayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    rating?: number;
    userRatingCount?: number;
  }>;
}

export const readNearbyRestaurants = (
  body: unknown,
  /*
    A floor on how well known a place has to be.
    
    It exists because 「near here」 ranked by popularity still returns places
    with three reviews, and 「nearest」 is not a recommendation. A place the
    traveller typed the name of is not a recommendation either — it is a
    request, so the floor does not apply to it. 「這裡還需要：更多搜尋🔍」.
  */
  minimumRatings: number = ENOUGH_RATINGS,
): NearbyRestaurant[] =>
  ((body as PlacesResponse)?.places || [])
    .filter(place => (place.userRatingCount || 0) >= minimumRatings)
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
        ...(place.primaryTypeDisplayName?.text?.trim()
          ? { kind: place.primaryTypeDisplayName.text.trim() }
          : {}),
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

    // Anything that is not 「活動」 asks for food, which is where this started.
    const looking = req.body?.looking === 'activity' ? 'activity' : 'food';
    /*
      「這裡還需要：更多搜尋🔍」.

      Three places near a corner is an offer. A traveller who already knows
      what they are looking for — 「一蘭」, 「淺草 燒肉」 — was left with the three
      we chose and no way past them.

      A named search is a different question from 「what is near here」, so it
      asks Google a different way: `searchText` biased to the same corner
      rather than a category sweep of it. Same fields, so the cards are the
      same cards.
    */
    const query = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 80) : '';

    const apiKey = deps.googleApiKey?.() ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) { res.json({ restaurants: [] }); return; }

    try {
      const call = deps.fetchImpl ?? fetch;
      const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // `primaryTypeDisplayName` rides along on a request already being
        // made: 「告訴我是哪類餐廳」 costs nothing extra.
        'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryTypeDisplayName,places.location,places.rating,places.userRatingCount',
      };
      const response = query
        ? await call('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            textQuery: query,
            maxResultCount: 10,
            languageCode: 'zh-TW',
            // Bias, not restriction: a traveller searching a name wants that
            // place, and refusing it for being 300m outside our circle is a
            // worse answer than showing it.
            locationBias: { circle: { center: { latitude, longitude }, radius } },
          }),
          signal: AbortSignal.timeout(6_000),
        })
        : await call('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            includedPrimaryTypes: LOOKING_FOR[looking],
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
      // A place asked for by name is a request, not a recommendation.
      res.json({ restaurants: readNearbyRestaurants(await response.json(), query ? 0 : ENOUGH_RATINGS) });
    } catch {
      res.json({ restaurants: [] });
    }
  });
};
