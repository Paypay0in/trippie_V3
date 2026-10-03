import { SavedTravelInspiration } from '../types';
import { noteIsCovered } from './itineraryImageSlices';

/**
 * One place, one entry on the list — whoever put it there.
 *
 * 「好啊 收藏可以同步 也要可以檢查是否重複」. Two people building a want-to-go list
 * together will save the same place: the same friend sent both of them the same
 * screenshot, or one typed 「Panier」 and the other 「panier」. Before sync that was
 * invisible, because each phone only ever saw its own list.
 *
 * The local merge in screenshotInspiration deliberately keeps one traveller's
 * saves separate from another's — that store is personal, and folding somebody
 * else's find into yours would be wrong there. This one is for the trip's shared
 * list, where the opposite is true: the list is the group's, and the same place
 * twice is just noise.
 */

/**
 * What makes two entries the same place.
 *
 * A Google place id is the same place however it was typed, so it wins. Without
 * one there is only the name, lowercased and trimmed — the weaker key, used only
 * when the stronger one is absent on either side.
 */
export const inspirationKey = (inspiration: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>): string =>
  inspiration.placeId?.trim()
    ? `place:${inspiration.placeId.trim()}`
    : `name:${(inspiration.placeName || '').trim().toLocaleLowerCase()}`;

const samePlace = (
  left: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>,
  right: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>,
): boolean => {
  const leftId = left.placeId?.trim();
  const rightId = right.placeId?.trim();
  if (leftId && rightId) return leftId === rightId;
  return (left.placeName || '').trim().toLocaleLowerCase()
    === (right.placeName || '').trim().toLocaleLowerCase();
};

/**
 * Folds two entries for the same place into one.
 *
 * The surviving entry keeps the earlier save — whoever found it first — and
 * gains everything either side knows: an address one of them resolved and the
 * other did not, and every note from both. Nothing a traveller wrote is dropped
 * because somebody else saved the same restaurant.
 */
const fold = (
  existing: SavedTravelInspiration,
  incoming: SavedTravelInspiration,
): SavedTravelInspiration => {
  const [first, second] = existing.savedAt <= incoming.savedAt
    ? [existing, incoming]
    : [incoming, existing];

  /*
    Notes fold on meaning, not on characters.

    Two devices that read the same screenshot get the same facts phrased
    differently, so matching exact text put both on one place — which is what
    「資訊會重複紀錄」 looked like from the list.
  */
  const notes = [...first.notes];
  second.notes.forEach(note => {
    if (!notes.some(saved => noteIsCovered(saved.text, note.text))) notes.push(note);
  });

  return {
    ...first,
    placeId: first.placeId || second.placeId,
    resolvedPlaceName: first.resolvedPlaceName || second.resolvedPlaceName,
    formattedAddress: first.formattedAddress || second.formattedAddress,
    latitude: first.latitude ?? second.latitude,
    longitude: first.longitude ?? second.longitude,
    placePhotoUrl: first.placePhotoUrl || second.placePhotoUrl,
    notes,
    sourceNoteIds: Array.from(new Set([...first.sourceNoteIds, ...second.sourceNoteIds])),
  };
};

/**
 * The trip's list, with duplicates folded together.
 *
 * Order follows first appearance, so a list does not reshuffle itself every
 * time the other phone syncs.
 */
export const mergeTripInspirations = (
  ...lists: SavedTravelInspiration[][]
): SavedTravelInspiration[] => {
  const merged: SavedTravelInspiration[] = [];

  lists.flat().forEach(entry => {
    if (!entry?.placeName?.trim()) return;
    const index = merged.findIndex(saved => samePlace(saved, entry));
    if (index < 0) merged.push(entry);
    else merged[index] = fold(merged[index], entry);
  });

  return merged;
};

/**
 * Duplicates already sitting in one list, as groups.
 *
 * Exposed so a device that saved the same place twice before this rule existed
 * can be told about it rather than quietly carrying both forever.
 */
export const findDuplicateInspirations = (
  inspirations: SavedTravelInspiration[],
): SavedTravelInspiration[][] => {
  const groups = new Map<string, SavedTravelInspiration[]>();
  inspirations.forEach(entry => {
    if (!entry?.placeName?.trim()) return;
    const key = inspirationKey(entry);
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  return Array.from(groups.values()).filter(group => group.length > 1);
};
