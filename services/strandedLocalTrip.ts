import { TripDraft } from './tripPersistence';

/**
 * The empty trip somebody is stuck on while the real one sits beside it.
 *
 * The second traveller spent three days inside a 釜山 of her own — no dates,
 * nothing in it, existing only on her phone — while the shared 釜山 holding 23
 * plans and 3 bills was one tap away on the same shelf under the same name and
 * the same cover. Every reload put her back on the empty one, and the app's
 * answer was to show her both and let her choose again.
 *
 * It can decide this itself, but only in the case where there is nothing to get
 * wrong: the open trip is empty, it exists nowhere but this device, and the
 * account belongs to a cloud trip that has something in it. A trip someone has
 * actually put work into is never moved away from.
 */

/** A cloud trip as the bookshelf knows it after the merge. */
export interface CloudTripRef {
  id: string;
  name?: string;
  startDate?: string;
  endDate?: string;
}

const sameName = (a?: string, b?: string) =>
  Boolean(a?.trim()) && a?.trim() === b?.trim();

const sameDates = (draft: TripDraft, trip: CloudTripRef) =>
  (draft.startDate || '') === (trip.startDate || '')
  && (draft.endDate || '') === (trip.endDate || '');

/**
 * Empty means nothing has been put in it — not that it has no dates.
 *
 * The duplicate the owner's computer produced on signing in carried the right
 * name and the right dates and nothing else: 釜山 10/02–10/07 with 0 plans, born
 * at the minute he logged in, beside the shared 釜山 holding 23. Requiring blank
 * dates would have excused exactly the trip that needed catching.
 */
const isEmpty = (draft: TripDraft): boolean =>
  (draft.itinerary || []).length === 0
  && (draft.expenses || []).length === 0;

/**
 * The cloud trip to open instead, or null to leave the traveller where they are.
 *
 * Null is the answer whenever the choice is not obvious: no open trip, an open
 * trip that is shared or has contents, or more than one cloud trip to pick from.
 */
export const strandedLocalTripEscape = (
  openDraft: TripDraft | undefined,
  cloudTrips: CloudTripRef[],
): CloudTripRef | null => {
  if (!openDraft || !isEmpty(openDraft)) return null;
  // Already a cloud trip: being empty is then a fact about the trip, not a
  // sign of being on the wrong one.
  if (cloudTrips.some(trip => trip.id === openDraft.id)) return null;
  if (cloudTrips.length === 1) return cloudTrips[0];

  /**
   * More than one cloud trip, so the single-trip shortcut cannot answer it —
   * and that is the owner's own account, which holds six. The duplicate his
   * computer made is not ambiguous, though: it is a copy, carrying the same
   * name and the same dates as exactly one trip on the server.
   *
   * One match is an answer. Two would be a guess, and guessing is what put
   * both travellers in the wrong 釜山 for three days.
   */
  const twins = cloudTrips.filter(
    trip => sameName(openDraft.name, trip.name) && sameDates(openDraft, trip),
  );
  return twins.length === 1 ? twins[0] : null;
};
