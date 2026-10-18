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
 * How far out of the way a suggestion may be and still be a suggestion.
 *
 * His empty 10:00 block offered 東京聖瑪利亞主教座堂・繞 10 公里, 東京日生劇場・繞
 * 10.2 公里 and 淺草 ROCKZA劇場・繞 14.8 公里 — for a morning in 世田谷. Nothing
 * was near, so it offered what was far and said so, which is a list that
 * costs a read and gives nothing back.
 *
 * An empty row saying only 「＋ 選一個地點」 is the honest answer when the
 * collection has nothing nearby.
 */
export const WORTH_SUGGESTING_KM = 3;

/**
 * How close two detours have to be before what the block is for decides.
 *
 * Preference used to sort ahead of distance outright, so a 劇場 fourteen
 * kilometres away outranked a café three hundred metres away. 「A restaurant
 * two hundred metres further is still a better lunch than a shop next door」
 * is true; it stops being true somewhere, and a kilometre is where.
 */
const SAME_DISTANCE_KM = 1;

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
    // 「Near here」 or nothing. See `WORTH_SUGGESTING_KM`.
    .filter(place => place.detourKm <= WORTH_SUGGESTING_KM)
    .sort((left, right) => {
      /*
        Roughly how far, then what the block is for, then exactly how far.

        A restaurant two hundred metres further is still a better lunch than a
        shop next door — within a kilometre they are the same walk and the
        block decides. Past that the walk decides, which is what stopped a
        theatre fourteen kilometres away leading the list.
      */
      const band = (value: number) => Math.floor(value / SAME_DISTANCE_KM);
      const leftRank = preferred.indexOf(left.category || '');
      const rightRank = preferred.indexOf(right.category || '');
      const leftPlace = leftRank === -1 ? preferred.length : leftRank;
      const rightPlace = rightRank === -1 ? preferred.length : rightRank;
      return band(left.detourKm) - band(right.detourKm)
        || leftPlace - rightPlace
        || left.detourKm - right.detourKm;
    })
    .slice(0, limit);
};
