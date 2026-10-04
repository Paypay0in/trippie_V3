import { SavedTravelInspiration } from '../types';
import { ResolvedCandidate } from './placeCandidates';

/**
 * A place the traveller added by hand.
 *
 * 「這裡要有可以手動加入的功能」. Until now the collection could only be filled
 * from a screenshot, so a place somebody simply knows about — recommended over
 * dinner, remembered from last time, seen on a sign — had no way in short of
 * screenshotting something.
 *
 * It goes into the same store a screenshot's places do, and carries its own
 * provenance for the same reason they do: nobody wrote it, so nobody is
 * credited for it, and the row can say where it came from rather than implying
 * an author who does not exist.
 */

export const MANUAL_SOURCE_PREFIX = 'manual:';

export const isManualInspiration = (
  inspiration: Pick<SavedTravelInspiration, 'sourcePostId'>,
): boolean => inspiration.sourcePostId.startsWith(MANUAL_SOURCE_PREFIX);

export interface ManualSaveContext {
  savedByUserId: string;
  /** The trip's own country and city; a search result states neither reliably. */
  country: string;
  city: string;
  makeId: () => string;
  savedAt?: string;
}

/**
 * Turns a chosen search result into a saved place.
 *
 * No notes: the traveller has not written any, and the Google record is
 * fetched live by the card rather than copied in here — a description frozen
 * at save time is one that quietly goes stale.
 */
export const manualInspirationFrom = (
  resolved: ResolvedCandidate,
  context: ManualSaveContext,
): SavedTravelInspiration => {
  const source = `${MANUAL_SOURCE_PREFIX}${resolved.placeId}`;

  return {
    id: context.makeId(),
    savedByUserId: context.savedByUserId,
    country: context.country,
    city: context.city,
    placeName: resolved.placeName,
    placeId: resolved.placeId,
    // Claimed because the traveller picked this exact place off a list of
    // candidates, which is the strongest confirmation the app ever gets.
    resolvedPlaceName: resolved.placeName,
    formattedAddress: resolved.address,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    sourcePostId: source,
    sourceSliceId: source,
    sourceCreatorId: context.savedByUserId,
    sourceNoteIds: [],
    savedAt: context.savedAt || new Date().toISOString(),
    notes: [],
  } as SavedTravelInspiration;
};
