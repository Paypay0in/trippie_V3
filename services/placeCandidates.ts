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
  address?: string;
  latitude?: number;
  longitude?: number;
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
  };
};
