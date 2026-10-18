/**
 * A restaurant from the collection that would cost less of a detour.
 *
 * 「能自動由我的收藏清單中推薦取代2的餐廳並列出」.
 *
 * 優化動線 already names the restaurant whose mealtime costs a detour — 拉麵 改
 * on his 淺草 day. Naming it leaves the traveller to open the collection, read
 * fifty places, and work out which of them is near Thursday's route. That is
 * arithmetic, and the collection is right there.
 *
 * Offered, never applied. These are places somebody chose for reasons this
 * knows nothing about — a dish, a friend's recommendation, a photo — and
 * 「nearer」 is only one of them.
 */
import { ItineraryItem } from '../types';
import { kmBetween } from './optimiseTripRoute';

export interface SavedPlaceForSwap {
  id: string;
  placeName: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  /** Already somewhere on this trip's plan; suggesting it again is a duplicate. */
  alreadyPlanned?: boolean;
}

export interface RestaurantSwap {
  id: string;
  placeName: string;
  /** Kilometres of detour saved against the one being replaced. */
  savesKm: number;
}

/** Tags that can stand in for a meal. A shop cannot. */
const FEEDS = new Set(['food', 'cafe']);

interface Point { latitude: number; longitude: number }

const located = <T extends { latitude?: number; longitude?: number }>(place: T): place is T & Point =>
  typeof place.latitude === 'number' && typeof place.longitude === 'number';

/**
 * How far a day is stretched to include one stop at a given position.
 *
 * The neighbours it would sit between, which is what 「detour」 means here: not
 * the distance to it, but the extra distance caused by going via it.
 */
const detourKm = (before: Point | undefined, after: Point | undefined, stop: Point): number => {
  if (before && after) {
    return kmBetween(before, stop) + kmBetween(stop, after) - kmBetween(before, after);
  }
  const neighbour = before || after;
  return neighbour ? kmBetween(neighbour, stop) : 0;
};

/**
 * Up to three saved places that would sit more easily in the same slot.
 *
 * @param day the day in the order it is walked, including the stop being replaced.
 * @param replacing the id of the restaurant costing the detour.
 */
export const nearerRestaurants = (
  day: ItineraryItem[],
  replacing: string,
  saved: SavedPlaceForSwap[],
  limit = 3,
): RestaurantSwap[] => {
  const index = day.findIndex(item => item.id === replacing);
  if (index === -1) return [];
  const current = day[index];
  if (!located(current)) return [];

  const before = day.slice(0, index).reverse().find(located);
  const after = day.slice(index + 1).find(located);
  // Nothing either side: the day is this one stop, and there is no detour.
  if (!before && !after) return [];

  const currentDetour = detourKm(before, after, current);

  return saved
    .filter(place => FEEDS.has(place.category || '') && !place.alreadyPlanned && located(place))
    // A place already on the day is not a replacement for itself.
    .filter(place => !day.some(item => item.id === place.id || item.placeId === place.id))
    .map(place => ({
      id: place.id,
      placeName: place.placeName,
      savesKm: currentDetour - detourKm(before, after, place as Point),
    }))
    /*
      Strictly better, and by enough to be worth reading. A hundred metres is
      noise on a walk and is not a reason to change where somebody eats.
    */
    .filter(swap => swap.savesKm >= 0.3)
    .sort((left, right) => right.savesKm - left.savesKm)
    .slice(0, limit)
    .map(swap => ({ ...swap, savesKm: Math.round(swap.savesKm * 10) / 10 }));
};
