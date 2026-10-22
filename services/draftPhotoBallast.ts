/**
 * Photographs, when the device has no room for them.
 *
 * 「行程儲存失敗…這台裝置的儲存空間可能滿了」 — and before that, a white screen.
 * Both were the same thing: receipt photos live inside the draft as base64, a
 * handful of them is megabytes, and localStorage gives a page about five. Once
 * it is full nothing can be written — not a photo, not a stop added to
 * tomorrow, nothing.
 *
 * But a photo on a synced trip is already on the server: `tripSyncMapping`
 * writes `expenses.receipt_photos` on every push, and a read puts the server's
 * row back over the local one （`mergeWithUnpushed` returns remote first）. So
 * the local copy of a confirmed photo is a cache, and a cache is the right
 * thing to drop when the shelf is full.
 *
 * Confirmed is the whole of the safety. `everSeenRemoteIds` records the ids
 * the server has actually acknowledged for a trip, so a photo taken five
 * minutes ago in a basement with no signal is not 「confirmed」 and is never
 * touched. The worst case here is a photo having to be fetched again; the case
 * being avoided is a traveller unable to save anything at all.
 *
 * A stop's own photographs go the same way, and had to the day they existed:
 * 「這照片好像不會存」 was a shopping list losing pictures it had nothing to do
 * with, because 旅程回顧 had just filled the same five megabytes with 淺草寺.
 * `itinerary_items.photos` is pushed on every sync, so a confirmed stop's
 * pictures are a cache too.
 */
import { loadEverSeen } from './everSeenRemoteIds';
import { TripDraft } from './tripPersistence';

export interface LightenedDrafts {
  drafts: TripDraft[];
  /** How many photos were dropped from the local copy. */
  dropped: number;
}

/**
 * The same drafts, without the local copy of photos the cloud has confirmed.
 *
 * Returns the originals untouched when there is nothing safe to drop, so a
 * caller can tell 「freed some room」 from 「there was none to free」.
 */
export const withoutCloudHeldPhotos = (drafts: TripDraft[]): LightenedDrafts => {
  let dropped = 0;

  const lightened = drafts.map(draft => {
    // Acknowledged by the server for this trip, and nothing else.
    const seen = loadEverSeen(draft.id);
    const confirmedBills = new Set(seen.expenses ?? []);
    const confirmedStops = new Set(seen.itinerary ?? []);
    const confirmedBuys = new Set(seen.shoppingList ?? []);
    if (confirmedBills.size === 0 && confirmedStops.size === 0 && confirmedBuys.size === 0) return draft;

    let touched = false;

    const expenses = (draft.expenses ?? []).map(expense => {
      const photos = expense.receiptPhotos ?? [];
      if (photos.length === 0 || !confirmedBills.has(expense.id)) return expense;
      dropped += photos.length;
      touched = true;
      const { receiptPhotos, ...rest } = expense;
      return rest as typeof expense;
    });

    const itinerary = (draft.itinerary ?? []).map(item => {
      const photos = item.photos ?? [];
      if (photos.length === 0 || !confirmedStops.has(item.id)) return item;
      dropped += photos.length;
      touched = true;
      const { photos: _dropped, ...rest } = item;
      return rest as typeof item;
    });

    /* A product picture is a cache the moment the list reaches the server. */
    const shoppingList = (draft.shoppingList ?? []).map(item => {
      if (!item.photo || !confirmedBuys.has(item.id)) return item;
      dropped += 1;
      touched = true;
      const { photo, ...rest } = item;
      return rest as typeof item;
    });

    return touched ? { ...draft, expenses, itinerary, shoppingList } : draft;
  });

  return dropped > 0 ? { drafts: lightened, dropped } : { drafts, dropped: 0 };
};
