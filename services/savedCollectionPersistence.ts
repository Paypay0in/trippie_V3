/**
 * 收藏集 on the device.
 *
 * The named lists and what is in them, beside the saved places they draw
 * from — which also live only here, in `trippie_saved_travel_inspirations_v1`.
 * A collection has to work in the same places its places do: before signing
 * in, offline, and on a device that has never reached Supabase.
 *
 * The server is for publishing. A collection nobody has published is nobody
 * else's business, and keeping it local until then is the cheapest possible
 * reading of 「private by default」.
 *
 * Membership is ids rather than copies. A place renamed or re-tagged must
 * show its new name in every list holding it; a copy would quietly go stale,
 * and the published snapshot — which is a copy, deliberately — is taken at
 * publish time from the live record.
 */

import { SavedCollection } from '../types';
import { visibilityOf } from './savedCollectionMapping';

export const SAVED_COLLECTIONS_STORAGE_KEY = 'trippie_saved_collections_v1';
export const SAVED_COLLECTION_MEMBERS_STORAGE_KEY = 'trippie_saved_collection_members_v1';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optional = (value: unknown): string | undefined =>
  (typeof value === 'string' && value.trim() ? value : undefined);

/**
 * One stored collection, field by field.
 *
 * A whitelist rather than a cast, for the reason the saved-places store
 * records: requiring nine fields to be present once destroyed eighteen of
 * forty records. The gate is an id and a title; everything else is read where
 * it is readable and absent where it is not.
 */
const normalise = (value: unknown): SavedCollection | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Record<string, unknown>;
  const id = text(row.id).trim();
  const title = text(row.title).trim();
  if (!id || !title) return undefined;

  return {
    id,
    ownerId: text(row.ownerId),
    title,
    ...(optional(row.description) ? { description: row.description as string } : {}),
    ...(optional(row.coverUrl) ? { coverUrl: row.coverUrl as string } : {}),
    country: text(row.country),
    city: text(row.city),
    /* An unreadable visibility reads as 私人; see `savedCollectionMapping`. */
    visibility: visibilityOf(row.visibility),
    sharesOwnNotes: row.sharesOwnNotes !== false,
    sharesPhotos: row.sharesPhotos !== false,
    sharesPlaceDetails: row.sharesPlaceDetails !== false,
    ...(optional(row.shareToken) ? { shareToken: row.shareToken as string } : {}),
    ...(optional(row.publishedAt) ? { publishedAt: row.publishedAt as string } : {}),
    ...(optional(row.revokedAt) ? { revokedAt: row.revokedAt as string } : {}),
    createdAt: text(row.createdAt) || new Date(0).toISOString(),
    updatedAt: text(row.updatedAt) || new Date(0).toISOString(),
  };
};

export const loadSavedCollections = (): SavedCollection[] => {
  try {
    const raw = localStorage.getItem(SAVED_COLLECTIONS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalise)
      .filter((entry): entry is SavedCollection => entry !== undefined);
  } catch {
    return [];
  }
};

export const saveSavedCollections = (collections: SavedCollection[]): void => {
  try {
    localStorage.setItem(SAVED_COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
  } catch {
    /* A full device keeps working; it simply forgets the arrangement. */
  }
};

/** Collection id → the saved-place ids it holds, in the owner's order. */
export type CollectionMembership = Record<string, string[]>;

export const loadCollectionMembership = (): CollectionMembership => {
  try {
    const raw = localStorage.getItem(SAVED_COLLECTION_MEMBERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CollectionMembership = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([id, ids]) => {
      if (!Array.isArray(ids)) return;
      const kept = Array.from(new Set(
        ids.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())),
      ));
      if (kept.length > 0) out[id] = kept;
    });
    return out;
  } catch {
    return {};
  }
};

export const saveCollectionMembership = (membership: CollectionMembership): void => {
  try {
    localStorage.setItem(SAVED_COLLECTION_MEMBERS_STORAGE_KEY, JSON.stringify(membership));
  } catch {
    /* As above. */
  }
};
