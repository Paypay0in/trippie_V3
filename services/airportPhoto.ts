import { fetchPlacePhoto, PlacePhoto } from './placePhotoService';
import { resolvePlace } from './placeService';

/**
 * A picture for a card that has a place name and no place id.
 *
 * 「這為啥都沒圖」, asked again about the three flight cards. The timeline has
 * fetched a photo per stop for months — keyed on `placeId`, which is the one
 * thing an item built from a flight anchor does not have. 航班起飛 and 抵達機場
 * carry the airport's full name and nothing to ask Google with, so they fell
 * through to the violet plane icon.
 *
 * Deliberately only for airports.
 *
 * Resolving an arbitrary typed name to a place would put a photo of somebody
 * else's café beside 「Cafe Onion」 and say nothing about having guessed. An
 * airport's full name — 「Taiwan Taoyuan International Airport」 — is one place
 * in the world, and the item carrying it was written from a boarding pass
 * rather than typed.
 *
 * Only the Places branch counts: `/api/places/resolve` also answers from
 * geocoding, which returns coordinates and an id that is not a Google place
 * id, and `resolvedPlaceName` is the discriminator. A photo request built on
 * the wrong kind of id returns nothing, slowly.
 */

const cache = new Map<string, Promise<PlacePhoto | null>>();

export const clearAirportPhotoCache = () => cache.clear();

export const fetchAirportPhoto = (airportName: string): Promise<PlacePhoto | null> => {
  const name = airportName.trim();
  if (!name) return Promise.resolve(null);

  const existing = cache.get(name);
  if (existing) return existing;

  const request = resolvePlace(name)
    .then(resolved => (resolved?.placeId && resolved.resolvedPlaceName
      ? fetchPlacePhoto(resolved.placeId)
      : null))
    // A picture beside a card is an ornament; a failure is simply no picture.
    .catch(() => null);

  cache.set(name, request);
  return request;
};
