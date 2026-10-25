/**
 * What goes out when a collection is published.
 *
 * The one place that answers 「what may a stranger see」. It is a pure function
 * on purpose: every privacy rule this ticket approved is a line here that can
 * be read, argued with, and tested, rather than a condition buried in a save
 * handler where the next person will not find it.
 *
 * Three rules, and the first is the one the Founder's own share sheet states:
 *
 * - 「我撰寫的心得筆記」. Only the owner's own notes are published. A place
 *   saved from somebody's post carries *their* words, attributed to them, and
 *   publishing those is republishing a third party's writing on a decision
 *   they never made. The place is a fact; their sentence about it is not the
 *   curator's to hand on.
 * - The switches are honoured. 照片 and 餐廳與景點資訊 are per-collection
 *   choices, stored rather than defaulted.
 * - Lineage survives. A place somebody else found keeps their name on it even
 *   as it travels into a third person's collection, and the curator's
 *   identity never overwrites the original author's.
 */

import {
  SavedCollection,
  SavedCollectionItem,
  SavedExperienceNote,
  SavedTravelInspiration,
} from '../types';

/** 「manual:…」 and 「screenshot:…」 mean 「nobody recommended this」. */
const SYNTHETIC_SOURCE = /^(?:manual|screenshot):/;

/**
 * Whether this record names somebody other than its holder as the finder.
 *
 * A place typed into the search box names the saver as its own creator, which
 * is a statement that nobody recommended it — carrying that forward as a
 * credit is how 「來自 X」 ends up naming the person reading it.
 */
export const statedCreatorOf = (
  record: Pick<SavedTravelInspiration, 'sourcePostId' | 'sourceCreatorId' | 'savedByUserId'>,
): string | undefined => {
  const post = (record.sourcePostId ?? '').trim();
  const creator = (record.sourceCreatorId ?? '').trim();
  if (!post || !creator || SYNTHETIC_SOURCE.test(post)) return undefined;
  if (creator === (record.savedByUserId ?? '').trim()) return undefined;
  return creator;
};

/**
 * The notes this owner wrote, out of everything attached to a place.
 *
 * Exported because the preview screen shows exactly this, and 「預覽公開版本」
 * is worthless if it previews something the publisher does not produce.
 */
export const ownNotes = (
  notes: SavedExperienceNote[],
  ownerId: string,
): SavedExperienceNote[] => {
  const owner = (ownerId ?? '').trim();
  if (!owner) return [];
  return notes.filter(note => (note.sourceCreatorId ?? '').trim() === owner);
};

/**
 * One saved place as it will be published.
 *
 * `position` is the caller's, because order is a property of the list and not
 * of any one place in it.
 */
export const publishableItem = (
  inspiration: SavedTravelInspiration,
  collection: Pick<SavedCollection, 'id' | 'ownerId' | 'sharesOwnNotes' | 'sharesPhotos' | 'sharesPlaceDetails'>,
  position: number,
  makeId: () => string,
): SavedCollectionItem => {
  const credited = statedCreatorOf(inspiration);
  return {
    id: makeId(),
    collectionId: collection.id,
    position,
    ...(inspiration.placeId ? { placeId: inspiration.placeId } : {}),
    placeName: (inspiration.resolvedPlaceName || inspiration.placeName || '').trim(),
    /*
      餐廳與景點資訊 — the address, the coordinates, the tag. Off and the
      place is still named and still findable; on and a reader can walk to it.
    */
    ...(collection.sharesPlaceDetails && inspiration.formattedAddress
      ? { formattedAddress: inspiration.formattedAddress } : {}),
    ...(collection.sharesPlaceDetails && typeof inspiration.latitude === 'number'
      ? { latitude: inspiration.latitude } : {}),
    ...(collection.sharesPlaceDetails && typeof inspiration.longitude === 'number'
      ? { longitude: inspiration.longitude } : {}),
    ...(collection.sharesPlaceDetails && inspiration.category
      ? { category: inspiration.category } : {}),
    ...(collection.sharesPhotos && inspiration.placePhotoUrl
      ? { placePhotoUrl: inspiration.placePhotoUrl } : {}),
    country: (inspiration.country ?? '').trim(),
    city: (inspiration.city ?? '').trim(),
    ...(collection.sharesPlaceDetails && inspiration.district
      ? { district: inspiration.district } : {}),
    notes: collection.sharesOwnNotes ? ownNotes(inspiration.notes ?? [], collection.ownerId) : [],
    /*
      Who found it, when that was not this owner — and which of their lists it
      came from, so a re-share can be followed back rather than guessed at.
    */
    ...(credited ? { sourceCreatorId: credited } : {}),
    ...(inspiration.sourcePostId && !SYNTHETIC_SOURCE.test(inspiration.sourcePostId)
      ? { sourceCollectionId: inspiration.sourcePostId } : {}),
    sourceInspirationId: inspiration.id,
  };
};

/** A whole collection's worth, in the order the owner arranged them. */
export const publishableItems = (
  inspirations: SavedTravelInspiration[],
  collection: Parameters<typeof publishableItem>[1],
  makeId: () => string,
): SavedCollectionItem[] => inspirations
  .filter(entry => (entry.resolvedPlaceName || entry.placeName || '').trim().length > 0)
  .map((entry, index) => publishableItem(entry, collection, index, makeId));

/**
 * What a link should now read, or `null` when nothing should leave the device.
 *
 * The snapshot behind a published collection follows its list: a place added
 * after 分享 was pressed is a place the holder of the link is expected to
 * see, and two copies with one of them older is the shape that has cost this
 * project a day at a time — worse here, because the owner's own screen reads
 * the local list and so shows no sign of the difference.
 *
 * A private or revoked collection returns `null` rather than an empty list:
 * nothing it holds has any business on the server, and uploading an empty
 * snapshot would overwrite what a revoked collection still owns.
 */
export const itemsForLink = (
  collection: Parameters<typeof publishableItem>[1] & { visibility?: string; revokedAt?: string },
  inspirations: SavedTravelInspiration[],
  makeId: () => string,
): SavedCollectionItem[] | null => {
  if (collection.visibility === 'private' || collection.revokedAt) return null;
  return publishableItems(inspirations, collection, makeId);
};
