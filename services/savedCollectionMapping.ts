/**
 * 收藏集 rows, in and out.
 *
 * Kept apart from the service that talks to Supabase for the same reason
 * `tripSyncMapping` is: a mapping is a pure function of two shapes and can be
 * tested without a network, and every defect this project has had in a sync
 * path turned out to live in the mapping rather than in the transport.
 *
 * Absent rather than null throughout on the way back. The client's shape says
 * 「nobody said」 with a missing field, and a null would read as an answer.
 */

import {
  PlaceCategory,
  SavedCollection,
  SavedCollectionItem,
  SavedExperienceNote,
  ShareVisibility,
} from '../types';

export interface SavedCollectionRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  country: string;
  city: string;
  visibility: string;
  shares_own_notes: boolean;
  shares_photos: boolean;
  shares_place_details: boolean;
  share_token: string | null;
  published_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedCollectionItemRow {
  id: string;
  collection_id: string;
  position: number;
  place_id: string | null;
  place_name: string;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_photo_url: string | null;
  category: string | null;
  country: string;
  city: string;
  district: string | null;
  notes: unknown;
  source_creator_id: string | null;
  source_collection_id: string | null;
  source_inspiration_id: string | null;
}

const VISIBILITIES: ShareVisibility[] = ['public', 'link', 'private'];

/**
 * An unreadable visibility reads as 私人.
 *
 * The safe direction. A row written by a build that knew a word this one does
 * not must not become readable by accident, and 「private」 is the only answer
 * that cannot leak anything.
 */
export const visibilityOf = (value: unknown): ShareVisibility =>
  (VISIBILITIES as string[]).includes(String(value))
    ? value as ShareVisibility
    : 'private';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A note is kept only when every id that attributes it is present. */
const notesFrom = (value: unknown): SavedExperienceNote[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((note): note is Record<string, unknown> => Boolean(note && typeof note === 'object'))
    .filter(note => ['id', 'sourceNoteId', 'sourceSliceId', 'sourcePostId', 'sourceCreatorId', 'text']
      .every(key => typeof note[key] === 'string' && Boolean((note[key] as string).trim())))
    .map(note => ({
      id: note.id as string,
      sourceNoteId: note.sourceNoteId as string,
      sourceSliceId: note.sourceSliceId as string,
      sourcePostId: note.sourcePostId as string,
      sourceCreatorId: note.sourceCreatorId as string,
      type: note.type as SavedExperienceNote['type'],
      text: note.text as string,
    }));
};

export const toCollectionRow = (collection: SavedCollection): SavedCollectionRow => ({
  id: collection.id,
  owner_id: collection.ownerId,
  title: collection.title,
  description: collection.description ?? null,
  cover_url: collection.coverUrl ?? null,
  country: collection.country ?? '',
  city: collection.city ?? '',
  visibility: collection.visibility,
  shares_own_notes: collection.sharesOwnNotes !== false,
  shares_photos: collection.sharesPhotos !== false,
  shares_place_details: collection.sharesPlaceDetails !== false,
  share_token: collection.shareToken ?? null,
  published_at: collection.publishedAt ?? null,
  revoked_at: collection.revokedAt ?? null,
  created_at: collection.createdAt,
  updated_at: collection.updatedAt,
});

export const fromCollectionRow = (row: SavedCollectionRow): SavedCollection => ({
  id: row.id,
  ownerId: row.owner_id,
  title: text(row.title),
  ...(row.description ? { description: row.description } : {}),
  ...(row.cover_url ? { coverUrl: row.cover_url } : {}),
  country: text(row.country),
  city: text(row.city),
  visibility: visibilityOf(row.visibility),
  sharesOwnNotes: row.shares_own_notes !== false,
  sharesPhotos: row.shares_photos !== false,
  sharesPlaceDetails: row.shares_place_details !== false,
  ...(row.share_token ? { shareToken: row.share_token } : {}),
  ...(row.published_at ? { publishedAt: row.published_at } : {}),
  ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toCollectionItemRow = (item: SavedCollectionItem): SavedCollectionItemRow => ({
  id: item.id,
  collection_id: item.collectionId,
  position: Number.isInteger(item.position) && item.position >= 0 ? item.position : 0,
  place_id: item.placeId ?? null,
  place_name: item.placeName,
  formatted_address: item.formattedAddress ?? null,
  latitude: typeof item.latitude === 'number' ? item.latitude : null,
  longitude: typeof item.longitude === 'number' ? item.longitude : null,
  place_photo_url: item.placePhotoUrl ?? null,
  category: item.category ?? null,
  country: item.country ?? '',
  city: item.city ?? '',
  district: item.district ?? null,
  notes: item.notes ?? [],
  source_creator_id: item.sourceCreatorId ?? null,
  source_collection_id: item.sourceCollectionId ?? null,
  source_inspiration_id: item.sourceInspirationId ?? null,
});

export const fromCollectionItemRow = (row: SavedCollectionItemRow): SavedCollectionItem => ({
  id: row.id,
  collectionId: row.collection_id,
  position: typeof row.position === 'number' ? row.position : 0,
  ...(row.place_id ? { placeId: row.place_id } : {}),
  placeName: text(row.place_name),
  ...(row.formatted_address ? { formattedAddress: row.formatted_address } : {}),
  ...(typeof row.latitude === 'number' ? { latitude: row.latitude } : {}),
  ...(typeof row.longitude === 'number' ? { longitude: row.longitude } : {}),
  ...(row.place_photo_url ? { placePhotoUrl: row.place_photo_url } : {}),
  ...(row.category ? { category: row.category as PlaceCategory } : {}),
  country: text(row.country),
  city: text(row.city),
  ...(row.district ? { district: row.district } : {}),
  notes: notesFrom(row.notes),
  ...(row.source_creator_id ? { sourceCreatorId: row.source_creator_id } : {}),
  ...(row.source_collection_id ? { sourceCollectionId: row.source_collection_id } : {}),
  ...(row.source_inspiration_id ? { sourceInspirationId: row.source_inspiration_id } : {}),
});
