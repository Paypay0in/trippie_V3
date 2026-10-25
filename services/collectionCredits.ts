/**
 * Turning the ids on a saved place into the line a person reads.
 *
 * 「來自 Ann 的東京咖啡地圖・收藏於 2024/03/10」. Everything needed to print
 * that is already stored — `sourceCreatorId` and the collection id inside
 * `sourcePostId` — and both are ids, deliberately: §8 asks for stable
 * lineage rather than names, because a name changes and a name matches the
 * wrong person.
 *
 * So the names are looked up, once, and remembered for the session. A credit
 * line is read far more often than the people in it change, and asking the
 * network every time a card scrolls past would make the attribution the most
 * expensive thing on the screen.
 *
 * Fails soft and says less rather than saying something wrong: a creator
 * whose name cannot be fetched is 「某位旅人」, never a guess and never the
 * reader's own name.
 */

import { supabase } from './supabaseClient';
import { collectionIdOf, isFromCollection } from './collectionSave';
import { SavedTravelInspiration } from '../types';

export interface PlaceCredit {
  /** The creator's display name, or undefined when it could not be read. */
  creatorName?: string;
  /** The collection's title, when it is still published. */
  collectionTitle?: string;
  /** The collection id, so 「查看原始收藏」 has somewhere to go. */
  collectionId?: string;
  savedAt: string;
}

const names = new Map<string, string>();
const titles = new Map<string, string>();
/** Ids already asked about, so a miss is not re-asked on every render. */
const asked = new Set<string>();

/** For tests, and for a sign-out: the session's memory of who is who. */
export const forgetCredits = (): void => {
  names.clear();
  titles.clear();
  asked.clear();
};

/**
 * Display names for these users.
 *
 * `profiles` is readable by anyone — its policy is `for select to public
 * using (true)` — which is what makes a credit line possible for a visitor
 * who is not signed in.
 */
export const loadCreatorNames = async (ids: string[]): Promise<Map<string, string>> => {
  const wanted = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)))
    .filter(id => !asked.has(id));
  if (wanted.length === 0 || !supabase) return names;
  wanted.forEach(id => asked.add(id));
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', wanted);
    if (error) throw error;
    (data ?? []).forEach((row: { id: string; display_name?: string }) => {
      const name = (row.display_name ?? '').trim();
      if (name) names.set(row.id, name);
    });
  } catch {
    /* Says 某位旅人 rather than nothing, and never a guess. */
  }
  return names;
};

/** Titles for these collections, where they are still published. */
export const loadCollectionTitles = async (ids: string[]): Promise<Map<string, string>> => {
  const wanted = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)))
    .filter(id => !asked.has(`c:${id}`));
  if (wanted.length === 0 || !supabase) return titles;
  wanted.forEach(id => asked.add(`c:${id}`));
  await Promise.all(wanted.map(async id => {
    try {
      const { data, error } = await supabase!.rpc('read_public_collection', {
        collection_id: id,
        token: null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const title = (row?.title ?? '').trim();
      if (title) titles.set(id, title);
    } catch {
      /*
        A collection that has been unpublished simply has no title to show.
        The place stays, the credit stays, and the link to the source is the
        thing that goes — 「不應自動抹除別人合法的收藏」, and equally the source
        must not stay readable through it.
      */
    }
  }));
  return titles;
};

/**
 * The credit for one saved place, or nothing where there is none to give.
 *
 * Nothing for a place the traveller found themselves: those name the saver
 * as their own creator, which is a statement that nobody recommended it.
 */
export const creditFor = (place: SavedTravelInspiration): PlaceCredit | undefined => {
  if (!isFromCollection(place)) return undefined;
  const collectionId = collectionIdOf(place);
  const creator = (place.sourceCreatorId ?? '').trim();
  if (!creator) return undefined;
  return {
    ...(names.get(creator) ? { creatorName: names.get(creator) } : {}),
    ...(collectionId && titles.get(collectionId)
      ? { collectionTitle: titles.get(collectionId) } : {}),
    ...(collectionId ? { collectionId } : {}),
    savedAt: place.savedAt,
  };
};

/** Everything a screenful of places needs, in one round trip each. */
export const loadCreditsFor = async (places: SavedTravelInspiration[]): Promise<void> => {
  const fromCollections = places.filter(isFromCollection);
  if (fromCollections.length === 0) return;
  await Promise.all([
    loadCreatorNames(fromCollections.map(place => place.sourceCreatorId)),
    loadCollectionTitles(
      fromCollections
        .map(collectionIdOf)
        .filter((id): id is string => Boolean(id)),
    ),
  ]);
};
