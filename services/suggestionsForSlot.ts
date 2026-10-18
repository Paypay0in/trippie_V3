/**
 * What to put in an empty block, without being asked.
 *
 * 「我都希望像這樣有空白行程的時候 會直接顯示附近的好地點 從收藏的優先推薦 或 Google
 * 搜尋結果」.
 *
 * An empty row offered a button. Pressing it opens fifty saved places and
 * leaves somebody to work out which of them is near the gap they are filling —
 * which is the same comparison `nearerRestaurants` already does for a meal,
 * and it is arithmetic either way.
 *
 * Ranked by detour, not distance: what a slot costs is the extra walking
 * caused by going via it, between the stop before and the stop after.
 */
import { ItineraryItem } from '../types';
import { kmBetween } from './optimiseTripRoute';

export interface SuggestablePlace {
  id: string;
  placeName: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  alreadyPlanned?: boolean;
}

export interface SlotSuggestion {
  id: string;
  placeName: string;
  category?: string;
  /** Extra kilometres this day would walk to include it. */
  detourKm: number;
}

interface Point { latitude: number; longitude: number }

const located = <T extends { latitude?: number; longitude?: number }>(place: T): place is T & Point =>
  typeof place.latitude === 'number' && typeof place.longitude === 'number';

/**
 * What a meal block wants, and what an afternoon wants.
 *
 * Leading rather than filtering, the same rule the picker uses: a café can be
 * an afternoon and a market can be lunch, and a suggestion list that hid them
 * would be answering a narrower question than the one being asked.
 */
const PREFERRED: Record<string, string[]> = {
  meal: ['food', 'cafe'],
  activity: ['sight', 'shop', 'cafe', 'food'],
};

/**
 * Up to three saved places that would fit this gap with the least detour.
 *
 * @param before the stop that runs before the gap, if any.
 * @param after the stop that runs after it, if any.
 */
export const suggestionsForSlot = (
  kind: 'meal' | 'activity',
  before: ItineraryItem | undefined,
  after: ItineraryItem | undefined,
  saved: SuggestablePlace[],
  limit = 3,
): SlotSuggestion[] => {
  const from = before && located(before) ? before : undefined;
  const to = after && located(after) ? after : undefined;
  /*
    A gap with nothing either side has no detour to measure, and 「here are
    three places somewhere in this city」 is not a suggestion. The picker is
    still one tap away.
  */
  if (!from && !to) return [];

  const preferred = PREFERRED[kind] || PREFERRED.activity;

  return saved
    // Split, so the type guard still narrows: a composite predicate does not.
    .filter(place => !place.alreadyPlanned)
    .filter(located)
    .map(place => {
      const detourKm = from && to
        ? kmBetween(from, place) + kmBetween(place, to) - kmBetween(from, to)
        : kmBetween((from || to) as Point, place);
      return {
        id: place.id,
        placeName: place.placeName,
        category: place.category,
        detourKm: Math.round(detourKm * 10) / 10,
      };
    })
    .sort((left, right) => {
      /*
        What the block is for comes first, then how far out of the way it is.
        A restaurant two hundred metres further is still a better lunch than a
        shop next door.
      */
      const leftRank = preferred.indexOf(left.category || '');
      const rightRank = preferred.indexOf(right.category || '');
      const leftPlace = leftRank === -1 ? preferred.length : leftRank;
      const rightPlace = rightRank === -1 ? preferred.length : rightRank;
      return leftPlace - rightPlace || left.detourKm - right.detourKm;
    })
    .slice(0, limit);
};
