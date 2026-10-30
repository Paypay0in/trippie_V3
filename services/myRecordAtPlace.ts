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
import i18n from '../i18n/config';

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
  /*
    The private journal, which has carried photographs since `0030` and whose
    photographs this had never read. 「這家店是分帳 因此我沒有原始帳目的紀錄 我
    就就不能傳圖跟做備注」 — at a place somebody else paid for, the journal is
    the only record of the evening that belongs to the reader, and half of it
    was being thrown away on the way to the screen.
  */
  journals: Readonly<Record<string, { text: string; photos?: string[] }>> = {},
): MyVisitRecord[] => {
  const wanted = new Set(placeIdentities(place));
  if (wanted.size === 0) return [];

  const records: MyVisitRecord[] = [];
  trips.forEach(trip => {
    (trip.itinerary || []).forEach(item => {
      if (!placeIdentities(item).some(key => wanted.has(key))) return;
      const journal = journals[item.id];
      const diary = journal?.text?.trim();
      /*
        The stop's photographs and the journal's, in that order and without
        repeating one. Two piles of the traveller's own pictures of the same
        evening is the kind of duplication this card exists to collapse.
      */
      const photos = Array.from(new Set([...(item.photos ?? []), ...(journal?.photos ?? [])]));
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

/**
 * 「★★★★★ · 8 張照片 · 有日記」 — the one line a list can carry.
 *
 * A summary rather than the thing itself: the collection is scrolled, and
 * the row beside this one learned the same lesson when it stopped printing
 * receipt thumbnails. Only what is actually there is named, so the line is
 * never padded out with 「0 張照片」.
 */
export const myRecordSummary = (records: MyVisitRecord[]): string => {
  const best = records
    .map(record => record.rating)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => right - left)[0];
  const photos = records.reduce((count, record) => count + (record.photos?.length ?? 0), 0);
  const wrote = records.some(record => record.diary);

  return [
    typeof best === 'number' ? '★'.repeat(Math.min(5, Math.round(best))) : '',
    photos > 0 ? i18n.t('saved.record.photoCount', { count: photos }) : '',
    wrote ? i18n.t('saved.record.hasDiary') : '',
  ].filter(Boolean).join(' · ');
};
