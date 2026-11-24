import { localToday, phaseForDate } from './tripPhaseByDate';

/**
 * Whether a trip is over.
 *
 * 「我感覺語意矛盾」. The app had two answers. The home card read the calendar
 * and said 已結束的旅程; the counter on 我 and the shelf's 已完成的旅程 read
 * `tripHistory` — archived trips — and so said a traveller who had just come
 * home had completed nothing. One trip, finished and not completed at once.
 *
 * The Founder settled it (2026-11-24, option A): finished is a fact about the
 * calendar. Archiving is tidying up. It puts a trip away; it does not decide
 * whether the trip happened.
 *
 * Built on `phaseForDate` rather than comparing dates here, because that is
 * already the one place that decides which part of a trip today falls in —
 * and 「which stage is this trip in」 having two implementations is how the
 * contradiction above was built in the first place.
 */

/** Anything with the two dates: a draft on the shelf or an archived trip. */
export interface DatedTrip {
  id: string;
  startDate?: string;
  endDate?: string;
}

export const tripIsFinished = (trip: DatedTrip): boolean => {
  const phase = phaseForDate(localToday(), trip.startDate, trip.endDate);
  // No phase means no usable dates — an idea, not a journey. Counting it as
  // finished would report a trip nobody took.
  if (!phase) return false;
  return phase !== 'pre' && phase !== 'during';
};

/**
 * How many trips this traveller has finished, across both places they live.
 *
 * Archived trips count regardless of their dates: putting one away is a
 * statement that it is done with, and the calendar never un-makes it. The
 * unarchived ones are decided by `tripIsFinished`.
 *
 * Deduplicated by id, because a trip that has been archived may still sit on
 * the shelf — and counting it twice is its own way of being wrong.
 */
export const countFinishedTrips = (
  archived: DatedTrip[],
  drafts: DatedTrip[],
): number => {
  const ids = new Set(archived.map(trip => trip.id));
  drafts.forEach(draft => {
    if (tripIsFinished(draft)) ids.add(draft.id);
  });
  return ids.size;
};
