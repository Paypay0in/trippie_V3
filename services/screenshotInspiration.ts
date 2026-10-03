import { SavedExperienceNote, SavedTravelInspiration } from '../types';
import { ItinerarySlice } from './itineraryImageSlices';

/**
 * A screenshot's places, saved the way everything else is saved.
 *
 * 「跟朋友會先把想去的地方列一個表單 … 可以變成一個收藏的 list 最後一鍵讓 AI 閱讀
 * 目前行程後 再根據收藏行程的地址去安排行程表排進去」.
 *
 * That list already exists. Saved Inspiration is the trip's collection of
 * places-to-maybe-go, the planner already lets them be ticked, and 補充行程
 * already reads the official itinerary and fits selected places into it around
 * the flights. Building a second list beside it would mean a second thing to
 * pick from, a second dedupe rule and a second place for a plan to hide.
 *
 * So a screenshot saves into the same store a community post does. The only
 * difference is provenance, and that is recorded rather than disguised: these
 * carry a `screenshot:` source instead of a post id, because no creator wrote
 * them and nobody should be credited for them.
 */

/** Marks an inspiration that came from the traveller's own screenshot. */
export const SCREENSHOT_SOURCE_PREFIX = 'screenshot:';

export const isFromScreenshot = (inspiration: Pick<SavedTravelInspiration, 'sourcePostId'>): boolean =>
  inspiration.sourcePostId.startsWith(SCREENSHOT_SOURCE_PREFIX);

export interface ScreenshotSaveContext {
  savedByUserId: string;
  /** The trip's own country and city: a screenshot states neither. */
  country: string;
  city: string;
  makeId: () => string;
  savedAt?: string;
  /** Place identity resolved by the caller, keyed by slice id. */
  resolved?: Record<string, {
    placeId?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    photoUrl?: string;
  }>;
}

/**
 * Turns chosen slices into saved inspirations.
 *
 * Notes keep their text and nothing else: a screenshot's note has no author to
 * attribute and no original post to link back to, and inventing either would
 * put a name on words nobody signed.
 */
export const slicesToSavedInspirations = (
  slices: ItinerarySlice[],
  context: ScreenshotSaveContext,
): SavedTravelInspiration[] =>
  slices.map(slice => {
    const source = `${SCREENSHOT_SOURCE_PREFIX}${slice.id}`;
    const place = context.resolved?.[slice.id];

    /*
      The summary becomes a note, because the collection has nowhere else to put it.

      「已收藏的也要列重點」. A SavedTravelInspiration carries a place and its
      notes and no free-text field, so a slice whose content the model had put
      in `summary` reached the collection as a bare name — which is exactly what
      his picker was showing: a list of restaurants with nothing under them.

      First in the list, because it is the line that says what the place is.
    */
    const lines = [
      ...(slice.summary ? [slice.summary] : []),
      ...slice.notes.map(note => note.text),
    ];

    const seen = new Set<string>();
    const notes: SavedExperienceNote[] = lines
      .map(text => text.trim())
      .filter(text => {
        if (!text || seen.has(text)) return false;
        seen.add(text);
        return true;
      })
      .map(text => ({
        id: context.makeId(),
        sourceNoteId: `${source}:${text.slice(0, 24)}`,
        sourceSliceId: source,
        sourcePostId: source,
        sourceCreatorId: context.savedByUserId,
        type: 'other' as const,
        text,
      }));

    return {
      id: context.makeId(),
      savedByUserId: context.savedByUserId,
      country: context.country,
      city: context.city,
      placeName: slice.placeName || slice.title,
      placeId: place?.placeId,
      // Only claimed when a lookup actually resolved it; a screenshot alone
      // never establishes that a name is a real place.
      resolvedPlaceName: place?.placeId ? (slice.placeName || slice.title) : undefined,
      formattedAddress: place?.address,
      latitude: place?.latitude,
      longitude: place?.longitude,
      placePhotoUrl: place?.photoUrl,
      sourcePostId: source,
      sourceSliceId: source,
      sourceCreatorId: context.savedByUserId,
      sourceNoteIds: notes.map(note => note.sourceNoteId),
      savedAt: context.savedAt || new Date().toISOString(),
      notes,
    };
  });

/**
 * Appends, without saving the same place twice.
 *
 * 「跟朋友會先把想去的地方列一個表單」 — two friends' lists overlap, and a place
 * already in the collection should gain whatever the second screenshot said
 * about it rather than appear again beneath it.
 */
export const mergeScreenshotInspirations = (
  current: SavedTravelInspiration[],
  incoming: SavedTravelInspiration[],
): SavedTravelInspiration[] => {
  const next = [...current];

  incoming.forEach(entry => {
    const key = entry.placeName.trim().toLocaleLowerCase();
    const existingIndex = next.findIndex(saved =>
      saved.savedByUserId === entry.savedByUserId
      && (saved.placeId && entry.placeId
        ? saved.placeId === entry.placeId
        : saved.placeName.trim().toLocaleLowerCase() === key));

    if (existingIndex < 0) { next.push(entry); return; }

    const existing = next[existingIndex];
    const notes = [...existing.notes];
    entry.notes.forEach(note => {
      if (!notes.some(saved => saved.text === note.text)) notes.push(note);
    });

    next[existingIndex] = {
      ...existing,
      // A later screenshot may be the one that resolved to a real place.
      placeId: existing.placeId || entry.placeId,
      formattedAddress: existing.formattedAddress || entry.formattedAddress,
      latitude: existing.latitude ?? entry.latitude,
      longitude: existing.longitude ?? entry.longitude,
      placePhotoUrl: existing.placePhotoUrl || entry.placePhotoUrl,
      notes,
      sourceNoteIds: Array.from(new Set([...existing.sourceNoteIds, ...entry.sourceNoteIds])),
    };
  });

  return next;
};
