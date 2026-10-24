/**
 * Publishing, unpublishing, and what each one means.
 *
 * Separated from both the screen and the network because the lifecycle is
 * where the approved privacy decisions live, and a decision that only exists
 * inside a button handler is a decision nobody can test.
 *
 * Four things happen here and nowhere else:
 *
 * - a new collection starts 私人, with no token and no publish date. Nothing
 *   is shared by accident;
 * - publishing stamps the date. `visibility` alone never grants access —
 *   the read function requires both, so a collection that was switched to
 *   公開 and never published stays unreadable;
 * - 僅連結 mints a token the first time it needs one and keeps it afterwards,
 *   so a link somebody already sent does not silently stop working;
 * - unpublishing stamps `revokedAt` rather than deleting anything. The link
 *   dies, the places stay, and what a recipient already saved is theirs.
 */

import { SavedCollection, ShareVisibility } from '../types';

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
    /*
      Private, and not because of a default somewhere else. 「All trips and
      saved collections are private by default」 is the first approved rule in
      the ticket, and this is the line that keeps it.
    */
    visibility: 'private',
    sharesOwnNotes: true,
    sharesPhotos: true,
    sharesPlaceDetails: true,
    createdAt: at,
    updatedAt: at,
  };
};

/**
 * A token nobody can guess.
 *
 * `crypto.randomUUID` where it exists, which is everywhere this app runs, and
 * a refusal rather than `Math.random` where it does not — a share link whose
 * token can be guessed is worse than no share link.
 */
export const mintShareToken = (): string => {
  const source = globalThis.crypto;
  if (!source?.randomUUID) throw new Error('沒有可用的亂數來源，無法建立分享連結');
  return source.randomUUID().replace(/-/g, '');
};

/**
 * Published, at this visibility.
 *
 * 公開 and 僅連結 both publish; the difference is whether it is listed, which
 * is the database's question and not this one's. Publishing something already
 * published re-stamps nothing: the original date is when people first saw it.
 */
export const publishCollection = (
  collection: SavedCollection,
  visibility: Exclude<ShareVisibility, 'private'>,
  now: () => string = () => new Date().toISOString(),
  token: () => string = mintShareToken,
): SavedCollection => {
  const at = now();
  const next: SavedCollection = {
    ...collection,
    visibility,
    publishedAt: collection.publishedAt ?? at,
    updatedAt: at,
  };
  delete next.revokedAt;
  /*
    The token is kept once minted. A 僅連結 collection switched to 公開 and
    back has the same link it always had — somebody has that link in a
    message, and quietly invalidating it is a broken promise rather than a
    security measure.
  */
  if (visibility === 'link' && !next.shareToken) next.shareToken = token();
  return next;
};

/**
 * Not published any more.
 *
 * `revokedAt` rather than deleting: the places stay, the owner keeps their
 * list, and the read function refuses it from the next request onward. What
 * a recipient already saved is theirs and is not touched — 「不應自動抹除別人
 * 合法的收藏」.
 */
export const unpublishCollection = (
  collection: SavedCollection,
  now: () => string = () => new Date().toISOString(),
): SavedCollection => {
  const at = now();
  return { ...collection, visibility: 'private', revokedAt: at, updatedAt: at };
};

/** Whether a stranger can reach this right now, for the screen to say so. */
export const isPublished = (collection: SavedCollection): boolean =>
  Boolean(collection.publishedAt) && !collection.revokedAt && collection.visibility !== 'private';

/**
 * The address to hand somebody.
 *
 * 公開 needs no token; 僅連結 is nothing without one. A collection that is
 * not published has no link at all, which is why this returns undefined
 * rather than a URL that would answer 「not found」.
 */
export const shareLinkFor = (
  collection: SavedCollection,
  origin: string,
): string | undefined => {
  if (!isPublished(collection)) return undefined;
  const base = `${origin}/?c=${encodeURIComponent(collection.id)}`;
  if (collection.visibility !== 'link') return base;
  return collection.shareToken ? `${base}&t=${encodeURIComponent(collection.shareToken)}` : undefined;
};

/** The query parameters a visitor arrives with. Kept beside the link that makes them. */
export const COLLECTION_QUERY_PARAM = 'c';
export const COLLECTION_TOKEN_PARAM = 't';

export const collectionFromUrl = (
  search: string,
): { id: string; token?: string } | undefined => {
  const params = new URLSearchParams(search);
  const id = params.get(COLLECTION_QUERY_PARAM)?.trim();
  if (!id) return undefined;
  const token = params.get(COLLECTION_TOKEN_PARAM)?.trim();
  return token ? { id, token } : { id };
};
