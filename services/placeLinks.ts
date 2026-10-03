/**
 * Getting from a saved place to the map.
 *
 * 「收藏的景點 應該要點擊後就跳出小卡 讓用戶可以轉跳到 Google 地圖等 不然很不友善」.
 * A name on a list is not somewhere you can go: the reader still has to select
 * it, switch app, paste, and hope the right 蟻家 comes back.
 *
 * Every link is built from what the save actually holds, in order of how
 * certain it is. A Google place id names one specific restaurant; coordinates
 * name a point; a name only names a search. Nothing here invents an id or a
 * coordinate it was not given — a link that looks right and opens the wrong
 * branch is worse than a search the reader can see is a search.
 */

export interface MappablePlace {
  placeName: string;
  placeId?: string;
  formattedAddress?: string;
  coordinates?: { latitude: number; longitude: number };
  city?: string;
  country?: string;
}

const hasCoordinates = (place: MappablePlace): place is MappablePlace & {
  coordinates: { latitude: number; longitude: number };
} => Number.isFinite(place.coordinates?.latitude) && Number.isFinite(place.coordinates?.longitude);

/**
 * The words to search for when there is no id and no point.
 *
 * The city and country go in because a restaurant name alone is ambiguous
 * across a country — and a screenshot of a Busan list, searched from Taipei,
 * resolves to whatever is nearest the reader.
 */
export const placeSearchQuery = (place: MappablePlace): string =>
  [place.formattedAddress || place.placeName, place.formattedAddress ? '' : place.city, place.formattedAddress ? '' : place.country]
    .filter(Boolean)
    .join(' ')
    .trim();

/** Opens the place on the map. */
export const placeMapsUrl = (place: MappablePlace): string => {
  const params = new URLSearchParams({ api: '1' });

  if (place.placeId?.trim()) {
    /*
      With an id, the query is only what Maps shows while it resolves — the id
      decides which place opens. Both are sent because Maps requires a query
      alongside `query_place_id`.
    */
    params.set('query', place.placeName);
    params.set('query_place_id', place.placeId.trim());
  } else if (hasCoordinates(place)) {
    params.set('query', `${place.coordinates.latitude},${place.coordinates.longitude}`);
  } else {
    params.set('query', placeSearchQuery(place));
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
};

/**
 * Directions to the place from wherever the reader is.
 *
 * No origin is set: Maps uses the device's own location, which is the only
 * origin that is right while standing in Busan.
 */
export const placeDirectionsUrl = (place: MappablePlace): string => {
  const params = new URLSearchParams({ api: '1' });

  if (hasCoordinates(place)) {
    // A point beats a name for navigation: it cannot resolve to another branch.
    params.set('destination', `${place.coordinates.latitude},${place.coordinates.longitude}`);
    if (place.placeId?.trim()) params.set('destination_place_id', place.placeId.trim());
  } else {
    params.set('destination', placeSearchQuery(place));
    if (place.placeId?.trim()) params.set('destination_place_id', place.placeId.trim());
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

/** What a reader can usefully copy: the address if it resolved, else the name. */
export const placeCopyText = (place: MappablePlace): string =>
  place.formattedAddress?.trim() || place.placeName;
