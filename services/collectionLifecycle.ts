/**
 * Publishing a 收藏集, in the words this product uses for it.
 *
 * The rules themselves are in `sharePublishing` — private by default, a
 * publish date that access actually depends on, a token kept once minted, and
 * revocation that deletes nothing. A trip publishes by exactly those rules, so
 * they cannot live here: two copies of 「can a stranger read this」 is one copy
 * too many, and the day they disagree is the day something private is legible.
 *
 * What is left here is what is true of a collection and not of a trip: the
 * draft it starts from, and the `?c=` link a recipient arrives with.
 */

import { SavedCollection, ShareVisibility } from '../types';
import {
  Shareable,
  isShared,
  mintShareToken,
  publishShareable,
  sharedFromUrl,
  shareLink,
  unpublishShareable,
  unsharedFields,
} from './sharePublishing';

export { mintShareToken };

export interface CollectionDraft {
  title: string;
  description?: string;
  coverUrl?: string;
  country?: string;
  city?: string;
}

/** A new collection: named, empty, and private. */
export const newCollection = (
  draft: CollectionDraft,
  ownerId: string,
  makeId: () => string,
  now: () => string = () => new Date().toISOString(),
): SavedCollection => {
  const at = now();
  return {
    id: makeId(),
    ownerId,
    title: draft.title.trim(),
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.coverUrl ? { coverUrl: draft.coverUrl } : {}),
    country: (draft.country ?? '').trim(),
    city: (draft.city ?? '').trim(),
    ...unsharedFields(),
    createdAt: at,
    updatedAt: at,
  };
};

export const publishCollection = (
  collection: SavedCollection,
  visibility: Exclude<ShareVisibility, 'private'>,
  now: () => string = () => new Date().toISOString(),
  token: () => string = mintShareToken,
): SavedCollection => publishShareable(collection, visibility, now, token);

export const unpublishCollection = (
  collection: SavedCollection,
  now: () => string = () => new Date().toISOString(),
): SavedCollection => unpublishShareable(collection, now);

/** Whether a stranger can reach this right now, for the screen to say so. */
export const isPublished = (collection: Shareable): boolean => isShared(collection);

/** The query parameters a visitor arrives with. Kept beside the link that makes them. */
export const COLLECTION_QUERY_PARAM = 'c';
export const COLLECTION_TOKEN_PARAM = 't';

export const shareLinkFor = (
  collection: SavedCollection,
  origin: string,
): string | undefined => shareLink(collection, origin, COLLECTION_QUERY_PARAM, collection.id);

export const collectionFromUrl = (
  search: string,
): { id: string; token?: string } | undefined =>
  sharedFromUrl(search, COLLECTION_QUERY_PARAM);
