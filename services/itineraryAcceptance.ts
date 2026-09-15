import { ItineraryItem } from '../types';
import { ProposedItineraryDay, ProposedItineraryItem, TripInspirationProposal } from './itineraryPlanningService';

/**
 * Turns an accepted AI proposal into official itinerary items and merges them into
 * the trip's existing itinerary. Everything here is pure: the caller owns state and
 * persistence, so a failed write can leave the proposal untouched and retryable.
 *
 * Nothing in this module reads or writes SavedTravelInspiration, CommunityPost or
 * PostSlice. Accepting a proposal copies provenance references into the itinerary;
 * it never mutates the source of that provenance.
 */

export type ItineraryAcceptanceMode = 'replace' | 'append';

const normalizeName = (value: string): string => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/**
 * A proposal item carries more identity than the itinerary form can produce, so the
 * mapping copies through whatever is available and drops proposal-only presentation
 * fields. `type` is ACTIVITY because the proposal has no transport/lodging concept;
 * the user can retype an item afterwards like any hand-entered one.
 */
export const toItineraryItem = (
  item: ProposedItineraryItem,
  date: string,
  id: string,
): ItineraryItem => ({
  id,
  date,
  time: item.suggestedStartTime || '',
  title: item.placeName,
  location: item.placeName,
  notes: item.note || '',
  type: 'ACTIVITY',
  isCompleted: false,
  // Resolved Google identity, when the saved place had one. An AI suggestion has
  // none, and normalizeTripInspirationProposal already refuses to invent one.
  ...(item.placeId ? { placeId: item.placeId } : {}),
  ...(item.coordinates ? { latitude: item.coordinates.latitude, longitude: item.coordinates.longitude } : {}),
  ...(item.address ? { address: item.address } : {}),
  ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}),
  origin: item.source,
  // Only ids the proposal already proved. An empty list stays absent rather than
  // being stored as an empty array that later reads as "checked and none".
  ...(item.sourceInspirationIds.length > 0 ? { sourceInspirationIds: [...item.sourceInspirationIds] } : {}),
  // Saved travel notes ride along with the proven linkage, never on their own: an
  // AI suggestion has no inspiration ids, so it can never arrive holding notes.
  ...(item.source === 'saved_inspiration' && item.sourceInspirationIds.length > 0 && item.experienceNotes?.length
    ? { savedTravelNotes: item.experienceNotes.map(note => ({ ...note })) }
    : {}),
});

/** Flattens the currently visible proposal. Only what is passed in is written. */
export const buildAcceptedItineraryItems = (
  proposal: Pick<TripInspirationProposal, 'days'>,
  createId: () => string,
): ItineraryItem[] => {
  const items: ItineraryItem[] = [];
  (proposal.days as ProposedItineraryDay[]).forEach(day => {
    day.items.forEach(item => items.push(toItineraryItem(item, day.date, createId())));
  });
  return items;
};

/**
 * Identity keys used for duplicate protection. A place name is never one of them on
 * its own: two different places share a name, and Phase 2 already settled that a
 * name is not an identity.
 *
 * - A resolved placeId is the identity, trip-wide. The same place on a different day
 *   is still the same place, and the proposal never repeats one internally.
 * - Saved Inspiration ids additionally tie an item to what the user saved.
 * - An AI suggestion has neither, so the only defensible key is an exact repeat:
 *   same date, same time and the same name. Anything looser would delete an item on
 *   nothing but similar wording.
 */
const identityKeysOf = (item: ItineraryItem): string[] => {
  const keys: string[] = [];
  const placeId = item.placeId?.trim();
  if (placeId) keys.push(`place:${placeId}`);
  (item.sourceInspirationIds || []).forEach(id => {
    const trimmed = id.trim();
    if (trimmed) keys.push(`inspiration:${trimmed}`);
  });
  if (keys.length > 0) return keys;
  const name = normalizeName(item.title || item.location || '');
  return name ? [`exact:${item.date || ''}|${item.time || ''}|${name}`] : [];
};

/**
 * Items that must survive a 取代現有行程 even when they sit inside the trip dates.
 * A flight anchor is derived data the planner never produced, and an expense-linked
 * item would orphan that expense's link. Neither is part of the AI proposal, so
 * neither is the proposal's to replace.
 */
const isProtectedFromReplace = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) || Boolean(item.linkedExpenseId);

export interface ItineraryMergeResult {
  items: ItineraryItem[];
  addedCount: number;
  /** Proposal items dropped because the itinerary already held that identity. */
  skippedDuplicateCount: number;
  /** Existing items cleared by 取代現有行程. */
  removedCount: number;
}

export interface ItineraryMergeInput {
  existing: ItineraryItem[];
  accepted: ItineraryItem[];
  mode: ItineraryAcceptanceMode;
  /** Trip planning range. Replace only ever clears dates inside it. */
  startDate?: string;
  endDate?: string;
}

const isValidDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Which existing items 取代現有行程 is allowed to clear. An undated item is not
 * provably inside the range, so it is kept: losing unrelated data is worse than
 * leaving a stale row the user can delete. When the trip has no usable range, the
 * dates the accepted proposal actually covers stand in for it.
 */
const buildReplaceScope = (input: ItineraryMergeInput): ((item: ItineraryItem) => boolean) => {
  const { startDate, endDate, accepted } = input;
  if (isValidDate(startDate) && isValidDate(endDate) && startDate <= endDate) {
    return item => isValidDate(item.date) && item.date >= startDate && item.date <= endDate;
  }
  const acceptedDates = new Set(accepted.map(item => item.date).filter(isValidDate));
  return item => isValidDate(item.date) && acceptedDates.has(item.date);
};

const byDateThenTime = (left: ItineraryItem, right: ItineraryItem): number => {
  const dateOrder = (left.date || '9999-99-99').localeCompare(right.date || '9999-99-99');
  if (dateOrder !== 0) return dateOrder;
  return (left.time || '99:99').localeCompare(right.time || '99:99');
};

/**
 * Merges an accepted proposal into the official itinerary. Replace clears the trip
 * range then writes; append keeps everything and adds only what is not already
 * there. Either way the result is the existing itinerary plus this one proposal —
 * no earlier proposal can re-enter, because only what the caller passes is written.
 */
export const mergeAcceptedItinerary = (input: ItineraryMergeInput): ItineraryMergeResult => {
  const { existing, accepted, mode } = input;

  const kept = mode === 'replace'
    ? (() => {
        const inScope = buildReplaceScope(input);
        return existing.filter(item => !inScope(item) || isProtectedFromReplace(item));
      })()
    : [...existing];
  const removedCount = existing.length - kept.length;

  const takenKeys = new Set<string>();
  kept.forEach(item => identityKeysOf(item).forEach(key => takenKeys.add(key)));

  const additions: ItineraryItem[] = [];
  let skippedDuplicateCount = 0;
  accepted.forEach(item => {
    const keys = identityKeysOf(item);
    if (keys.some(key => takenKeys.has(key))) {
      skippedDuplicateCount += 1;
      return;
    }
    keys.forEach(key => takenKeys.add(key));
    additions.push(item);
  });

  return {
    items: [...kept, ...additions].sort(byDateThenTime),
    addedCount: additions.length,
    skippedDuplicateCount,
    removedCount,
  };
};
