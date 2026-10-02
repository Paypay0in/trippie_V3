import { ItineraryItem } from '../types';
import { ResolvedPlace } from './placeService';

/**
 * Linking a booked hotel to the place it actually is.
 *
 * 「住宿訊息補上了，但為何行程方塊找不到住宿點，不合理」 — the card carried the
 * full street address, printed it twice, and still said 地圖上沒有這個地點.
 * Everything downstream is keyed on `placeId` and coordinates, not on an
 * address string, so the booking was invisible to all of it: no photo, no map
 * link, and no travel time to or from it.
 *
 * That last one is the part that hurts. The itinerary already draws a transport
 * leg between consecutive places with transit, driving and walking to choose
 * from — it needs two sets of coordinates, and an unlinked hotel means every
 * journey into or out of the place they sleep reads 「其中一個地點還沒連結地圖，
 * 無法計算交通時間」.
 *
 * A booking is the easiest thing on an itinerary to resolve: unlike 「廣安里海景
 * 早午餐咖啡廳」, which is a description, a confirmed reservation names a real
 * business and prints its street address.
 */

const isStay = (item: ItineraryItem): boolean =>
  item.type === 'HOTEL' && item.fixedEventKind === 'accommodation';

/**
 * The search text for a booking.
 *
 * Name and address together, because either alone is weaker: hotel names
 * repeat across a chain, and an address alone resolves to the building rather
 * than the business in it.
 */
export const stayPlaceQuery = (hotelName?: string, address?: string): string =>
  [hotelName?.trim(), address?.trim()].filter(Boolean).join(' ').trim();

/** True when this booking still needs linking, so no call is made for one that doesn't. */
export const stayNeedsPlaceLink = (item: ItineraryItem): boolean =>
  isStay(item) && !item.placeId && Boolean(stayPlaceQuery(item.title, item.address || item.location));

/**
 * Attaches a resolved place to the stay cards of one booking.
 *
 * Only the stay cards: a booking produces check-in and check-out, and both are
 * the same hotel. The address already typed on the item is kept when Google
 * returns none, since a booking's own address is not a guess.
 */
export const linkStayItems = <T extends ItineraryItem>(items: T[], place: ResolvedPlace | null): T[] => {
  if (!place?.placeId) return items;
  const latitude = typeof place.latitude === 'number' && Number.isFinite(place.latitude) ? place.latitude : undefined;
  const longitude = typeof place.longitude === 'number' && Number.isFinite(place.longitude) ? place.longitude : undefined;

  return items.map(item => (isStay(item)
    ? {
        ...item,
        placeId: place.placeId,
        address: place.address?.trim() || item.address,
        ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
      }
    : item));
};
