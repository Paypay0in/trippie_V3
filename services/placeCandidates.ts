import { PlaceLookupContext, placeLookupQueries } from './placeLookupQuery';
import { autocompletePlaces, getPlaceDetails, PlaceSuggestion } from './placeService';

/**
 * Candidates for a place that never resolved.
 *
 * 「我還是希望要盡量找到資訊，你不能搜尋嗎？」 — and the answer is yes, but not
 * silently. Searching 「다곡소님 부산」 returns 「多鍋美食店 松亭店」: Google's best
 * guess at a name that does not exist, because the screenshot parser misread
 * 단골손님. Binding that automatically would give the traveller a card that
 * looks resolved, navigates confidently, and goes to the wrong restaurant.
 *
 * So the search runs and the results are shown. A person recognises their own
 * screenshot in a list of five in a second; no string-similarity rule does, and
 * the cost of the rule being wrong is somebody standing outside the wrong shop.
 */

export interface PlaceCandidate {
  placeId: string;
  name: string;
  /** Address or district, as Google phrases it. */
  detail?: string;
}

/**
 * Searches the queries in order and stops at the first that finds anything.
 *
 * Stopping early is deliberate: the first query is the most specific one, and
 * mixing its results with a broader query's would bury the likely match among
 * places that merely share a word.
 */
export const findPlaceCandidates = async (
  placeName: string,
  context: PlaceLookupContext = {},
  limit = 5,
): Promise<PlaceCandidate[]> => {
  for (const query of placeLookupQueries(placeName, context)) {
    const suggestions = await autocompletePlaces(query, {
      country: context.country,
      ...(context.latitude !== undefined && context.longitude !== undefined
        ? { latitude: context.latitude, longitude: context.longitude }
        : {}),
    }).catch(() => [] as PlaceSuggestion[]);
    if (suggestions.length > 0) {
      return suggestions.slice(0, limit).map(suggestion => ({
        placeId: suggestion.placeId,
        name: suggestion.primaryText,
        detail: suggestion.secondaryText,
      }));
    }
  }
  return [];
};

export interface ResolvedCandidate {
  placeId: string;
  placeName: string;
  /** Google's category enum, folded into the 🏷️ tag. See `placeCategory`. */
  primaryType?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  /**
   * Where this place actually is, as Google states it.
   *
   * 「這個我手動加入的景點」 showed 「日本・日本」: the save took its town from the
   * trip, and on a trip created from a boarding pass the 「city」 is whatever
   * destination detection wrote, which is sometimes the country itself.
   *
   * `docs/PRODUCT.md` already settles this — Places owns a place's identity.
   * The trip is a fallback for when Google says nothing, not the source.
   */
  city?: string;
  country?: string;
  /** The ward, which is what an area heading is named by. */
  district?: string;
}

/** Turns a chosen candidate into the fields a saved place stores. */
export const resolveCandidate = async (candidate: PlaceCandidate): Promise<ResolvedCandidate | null> => {
  const details = await getPlaceDetails(candidate.placeId, `lookup-${candidate.placeId}`).catch(() => null);
  if (!details) return null;
  return {
    placeId: details.placeId || candidate.placeId,
    placeName: details.location || candidate.name,
    address: details.address,
    latitude: details.latitude,
    longitude: details.longitude,
    city: details.city,
    district: details.district,
    country: details.country,
    primaryType: details.primaryType,
  };
};

/**
 * Expands a Google short link into the full URL, which only the server can do.
 *
 * Returns the original on failure: the caller then reads it as text and says
 * it found nothing, which is a better end than a thrown error on a paste.
 */
export const expandMapsShortLink = async (url: string): Promise<string> => {
  try {
    const response = await fetch('/api/links/expand-maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) return url;
    const body = await response.json() as { url?: string };
    return typeof body.url === 'string' && body.url ? body.url : url;
  } catch {
    return url;
  }
};
