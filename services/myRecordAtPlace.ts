/**
 * What the traveller themselves recorded at a saved place.
 *
 * 「若在收藏中 有這個地點 應該要在收藏中可以看到我去的紀錄」.
 *
 * The collection holds what somebody else said about a place; 旅程回顧 holds
 * what happened when you went. They were two piles again — the same shape the
 * ledger and the collection were in before `spendAtPlace` joined them, and the
 * same answer: the record already exists, it just was not asked for from here.
 *
 * Matched on `placeIdentities`, which is this project's one rule for 「are
 * these two records the same place」 and is already what the 已訪 chip uses. A
 * second, looser rule living here would put another temple's photographs on
 * this card, which on a screen about memory is worse than showing nothing.
 */
import { ItineraryItem, SavedTravelInspiration } from '../types';
import { placeIdentities } from './visitedPlaces';

export interface MyVisitRecord {
  itemId: string;
  /** `YYYY-MM-DD`, the day it was on the plan. */
  date: string;
  tripName?: string;
  /** The star given while looking back, when one was. */
  rating?: number;
  /** The traveller's own photographs of the stop. */
  photos?: string[];
  /** Their private journal entry, when they wrote one. */
  diary?: string;
}

/**
 * Every stop in these trips that is this place, most recent first.
 *
 * Returns only what carries something: a stop with no rating, no photograph
 * and no writing is a line in an itinerary, and repeating it on the
 * collection card says nothing the 已訪 chip has not already said.
 */
export const myRecordAtPlace = (
  place: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>,
  trips: Array<{ name?: string; itinerary?: ItineraryItem[] }>,
  journals: Readonly<Record<string, { text: string }>> = {},
): MyVisitRecord[] => {
  const wanted = new Set(placeIdentities(place));
  if (wanted.size === 0) return [];

  const records: MyVisitRecord[] = [];
  trips.forEach(trip => {
    (trip.itinerary || []).forEach(item => {
      if (!placeIdentities(item).some(key => wanted.has(key))) return;
      const diary = journals[item.id]?.text?.trim();
      const photos = item.photos ?? [];
      if (typeof item.rating !== 'number' && photos.length === 0 && !diary) return;
      records.push({
        itemId: item.id,
        date: item.date ?? '',
        ...(trip.name ? { tripName: trip.name } : {}),
        ...(typeof item.rating === 'number' ? { rating: item.rating } : {}),
        ...(photos.length > 0 ? { photos } : {}),
        ...(diary ? { diary } : {}),
      });
    });
  });

  return records.sort((left, right) => (right.date || '').localeCompare(left.date || ''));
};
