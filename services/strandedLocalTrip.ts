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
}

const isEmpty = (draft: TripDraft): boolean =>
  (draft.itinerary || []).length === 0
  && (draft.expenses || []).length === 0
  && !draft.startDate
  && !draft.endDate;

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
  // Ambiguous as soon as there is a choice; guessing is what caused this.
  if (cloudTrips.length !== 1) return null;
  return cloudTrips[0];
};
