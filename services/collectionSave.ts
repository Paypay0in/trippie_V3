/**
 * Somebody else's collection, becoming yours.
 *
 * The receiving half of publishing, and the last link in the chain §8 asks
 * for: `Source → Shared Collection → Recipient Save → Recipient Trip`.
 *
 * Two rules decide everything here.
 *
 * **The recipient owns their copy.** A saved place is theirs — they can
 * rename it, tag it, delete it, plan with it — and nothing they do touches
 * the creator's list. That is why this produces whole records rather than
 * references: a reference would make the creator's later edit rewrite
 * somebody else's notebook.
 *
 * **The original creator keeps the credit.** A curator may share a place
 * somebody else found, and the latest sharer's identity must never overwrite
 * the original author's — so an item that already names a creator keeps
 * naming them, and only an item that names nobody is credited to the person
 * who published it.
 *
 * 「來自 Ann 的東京咖啡地圖」 is printed from what this writes.
 */

import { SavedCollectionItem, SavedExperienceNote, SavedTravelInspiration } from '../types';

/**
 * The marker that says 「this came from a shared collection」.
 *
 * A real source rather than a synthetic one: 「manual:…」 and 「screenshot:…」
 * mean 「nobody recommended this」, and a place somebody published is the
 * opposite of that. Everything downstream — the merge, the itinerary, the
 * 「來自 X」 line — keys off the difference.
 */
export const COLLECTION_SOURCE_PREFIX = 'collection:';

export const collectionSourceId = (collectionId: string): string =>
  `${COLLECTION_SOURCE_PREFIX}${collectionId}`;

export const isFromCollection = (
  record: Pick<SavedTravelInspiration, 'sourcePostId'>,
): boolean => record.sourcePostId.startsWith(COLLECTION_SOURCE_PREFIX);

/** The collection id a saved place came from, when it came from one. */
export const collectionIdOf = (
  record: Pick<SavedTravelInspiration, 'sourcePostId'>,
): string | undefined => (isFromCollection(record)
  ? record.sourcePostId.slice(COLLECTION_SOURCE_PREFIX.length)
  : undefined);

export interface SaveContext {
  /** Who is saving. Their own id, never the creator's. */
  savedByUserId: string;
  /** The collection being saved from. */
  collectionId: string;
  /** Whoever published it, used only where an item credits nobody. */
  publisherId: string;
  makeId: () => string;
  now?: () => string;
}

/**
 * One published place, as a record belonging to the person saving it.
 *
 * The notes come across whole. They were already filtered at publish time to
 * the publisher's own words, and each one still carries the id of whoever
 * wrote it — so a note that travelled through two collections still says who
 * said it.
 */
export const savedFromCollectionItem = (
  item: SavedCollectionItem,
  context: SaveContext,
): SavedTravelInspiration => {
  const at = (context.now ?? (() => new Date().toISOString()))();
  const notes: SavedExperienceNote[] = (item.notes ?? []).map(note => ({ ...note }));
  return {
    id: context.makeId(),
    savedByUserId: context.savedByUserId,
    country: item.country,
    city: item.city,
    ...(item.district ? { district: item.district } : {}),
    placeName: item.placeName,
    ...(item.placeId ? { placeId: item.placeId } : {}),
    ...(item.formattedAddress ? { formattedAddress: item.formattedAddress } : {}),
    ...(typeof item.latitude === 'number' ? { latitude: item.latitude } : {}),
    ...(typeof item.longitude === 'number' ? { longitude: item.longitude } : {}),
    ...(item.placePhotoUrl ? { placePhotoUrl: item.placePhotoUrl } : {}),
    ...(item.category ? { category: item.category } : {}),
    /*
      Where it came from, and who found it.

      `sourcePostId` names the collection so the 「查看原始收藏」 link has
      something to open. `sourceCreatorId` is the item's own credit where it
      has one — a curator sharing somebody else's find does not become the
      finder — and the publisher only where the item credits nobody.
    */
    sourcePostId: collectionSourceId(context.collectionId),
    sourceSliceId: item.id,
    sourceCreatorId: item.sourceCreatorId || context.publisherId,
    sourceNoteIds: notes.map(note => note.sourceNoteId),
    savedAt: at,
    notes,
  };
};

/**
 * A whole collection, or the places picked out of it.
 *
 * Deliberately one function for both. 「Save All」 and 「Select Places」 differ
 * only in which items arrive, and letting them differ anywhere else is how
 * one of them ends up keeping provenance the other drops.
 */
export const savedFromCollection = (
  items: SavedCollectionItem[],
  context: SaveContext,
): SavedTravelInspiration[] => items
  .filter(item => item.placeName.trim().length > 0)
  .map(item => savedFromCollectionItem(item, context));

/**
 * What a place this traveller already holds would collide with.
 *
 * 「Saving the same collection twice must not silently create duplicate
 * places」. The key is the one `inspirationMerge` already uses — a Google
 * Place id where there is one, the lowercased name where there is not — so
 * this answers the same question the merge will, rather than a second
 * question that happens to look similar.
 */
export const alreadyHeld = (
  item: SavedCollectionItem,
  held: SavedTravelInspiration[],
): SavedTravelInspiration | undefined => {
  const placeId = item.placeId?.trim();
  const name = item.placeName.trim().toLocaleLowerCase();
  return held.find(entry => (placeId && entry.placeId?.trim() === placeId)
    || (!placeId && !entry.placeId?.trim()
      && (entry.resolvedPlaceName || entry.placeName).trim().toLocaleLowerCase() === name));
};
