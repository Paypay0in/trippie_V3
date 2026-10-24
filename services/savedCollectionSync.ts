/**
 * Reading and writing 收藏集.
 *
 * Fails soft like every other sync path here: the screens keep working when
 * the network does not, and a failed push never costs somebody the list they
 * just arranged.
 *
 * Two kinds of read, and the difference is the whole security model.
 *
 * The owner's own collections come straight off the table, where the row
 * policy is `owner_id = auth.uid()` and nothing else is visible. A stranger's
 * published collection comes through `read_public_collection`, a
 * security-definer function — because 僅連結 is answered by holding a token,
 * a token is not an identity, and no row policy can check one. That is the
 * pattern `trip_invites` already proved, and the reason the table itself
 * stays unreadable to everyone but its owner.
 */

import { SavedCollection, SavedCollectionItem } from '../types';
import { supabase } from './supabaseClient';
import { SyncResult } from './tripSync';
import {
  SavedCollectionItemRow,
  SavedCollectionRow,
  fromCollectionItemRow,
  fromCollectionRow,
  toCollectionItemRow,
  toCollectionRow,
} from './savedCollectionMapping';

const failed = (error: unknown): SyncResult<never> => ({
  status: 'error',
  message: error instanceof Error ? error.message : String(error),
});

/** Everything this account owns, newest first. Never anybody else's. */
export const fetchMyCollections = async (): Promise<SyncResult<SavedCollection[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('saved_collections')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return { status: 'ok', data: (data as SavedCollectionRow[]).map(fromCollectionRow) };
  } catch (error) {
    return failed(error);
  }
};

export const fetchCollectionItems = async (
  collectionId: string,
): Promise<SyncResult<SavedCollectionItem[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase
      .from('saved_collection_items')
      .select('*')
      .eq('collection_id', collectionId)
      .order('position', { ascending: true });
    if (error) throw error;
    return { status: 'ok', data: (data as SavedCollectionItemRow[]).map(fromCollectionItemRow) };
  } catch (error) {
    return failed(error);
  }
};

export const saveCollection = async (
  collection: SavedCollection,
): Promise<SyncResult<SavedCollection>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase
      .from('saved_collections')
      .upsert(toCollectionRow(collection), { onConflict: 'id' });
    if (error) throw error;
    return { status: 'ok', data: collection };
  } catch (error) {
    return failed(error);
  }
};

/**
 * The collection's places, replaced wholesale.
 *
 * Replaced rather than merged, because the list is the thing being published:
 * a place the owner removed has to be gone, and a merge would resurrect it.
 * The same reasoning `applyTripInspirations` records for trip inspirations,
 * where merging turned a deletion into nothing at all.
 */
export const replaceCollectionItems = async (
  collectionId: string,
  items: SavedCollectionItem[],
): Promise<SyncResult<SavedCollectionItem[]>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error: cleared } = await supabase
      .from('saved_collection_items')
      .delete()
      .eq('collection_id', collectionId);
    if (cleared) throw cleared;
    if (items.length > 0) {
      const { error } = await supabase
        .from('saved_collection_items')
        .insert(items.map(toCollectionItemRow));
      if (error) throw error;
    }
    return { status: 'ok', data: items };
  } catch (error) {
    return failed(error);
  }
};

export const deleteCollection = async (collectionId: string): Promise<SyncResult<true>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { error } = await supabase.from('saved_collections').delete().eq('id', collectionId);
    if (error) throw error;
    return { status: 'ok', data: true };
  } catch (error) {
    return failed(error);
  }
};

/** What `read_public_collection` hands back: the collection and its places at once. */
export interface PublicCollection {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  country: string;
  city: string;
  publishedAt?: string;
  items: SavedCollectionItem[];
}

/**
 * Somebody else's published collection.
 *
 * Returns `not_found` for a collection that is private, unpublished, revoked,
 * or asked for without the token it needs — one answer for all of them, on
 * purpose. 「這個不存在」 and 「這個你不能看」 are different sentences, and the
 * second tells a stranger that something is there.
 */
export const readPublicCollection = async (
  collectionId: string,
  token?: string,
): Promise<SyncResult<PublicCollection> | { status: 'not_found' }> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('read_public_collection', {
      collection_id: collectionId,
      token: token ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { status: 'not_found' };
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      status: 'ok',
      data: {
        id: row.id,
        ownerId: row.owner_id,
        title: row.title ?? '',
        ...(row.description ? { description: row.description } : {}),
        ...(row.cover_url ? { coverUrl: row.cover_url } : {}),
        country: row.country ?? '',
        city: row.city ?? '',
        ...(row.published_at ? { publishedAt: row.published_at } : {}),
        items: items.map((item: Record<string, unknown>) => fromCollectionItemRow({
          ...(item as unknown as SavedCollectionItemRow),
          collection_id: collectionId,
        })),
      },
    };
  } catch (error) {
    return failed(error);
  }
};

/** One person's 公開 collections, for their profile. Never their 僅連結 ones. */
export const listPublicCollections = async (
  ownerId: string,
): Promise<SyncResult<Array<Pick<SavedCollection, 'id' | 'title' | 'description' | 'coverUrl' | 'country' | 'city' | 'publishedAt'> & { itemCount: number }>>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('list_public_collections', { owner: ownerId });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return {
      status: 'ok',
      data: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        title: String(row.title ?? ''),
        ...(row.description ? { description: String(row.description) } : {}),
        ...(row.cover_url ? { coverUrl: String(row.cover_url) } : {}),
        country: String(row.country ?? ''),
        city: String(row.city ?? ''),
        ...(row.published_at ? { publishedAt: String(row.published_at) } : {}),
        itemCount: Number(row.item_count ?? 0),
      })),
    };
  } catch (error) {
    return failed(error);
  }
};

/** How many people saved this. A number, never a list — see `0035`. */
export const countSaves = async (
  kind: 'collection' | 'trip' | 'post',
  targetId: string,
): Promise<SyncResult<number>> => {
  if (!supabase) return { status: 'unavailable' };
  try {
    const { data, error } = await supabase.rpc('count_content_saves', { kind, target: targetId });
    if (error) throw error;
    return { status: 'ok', data: Number(data ?? 0) };
  } catch (error) {
    return failed(error);
  }
};
