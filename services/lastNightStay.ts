/**
 * What the accommodation row says on a day with no room booked.
 *
 * 「最後一天的住宿資訊要寫成：今日退房」.
 *
 * The row had one empty state: 新增住宿資訊. On the last day of a trip that is
 * a prompt to book a room for a night the traveller is not there — they
 * checked out at 11:00 and flew home. The screenshot showed both at once:
 * 退房 11:00 directly above an invitation to find somewhere to sleep.
 *
 * But an unbooked night is not always the end of a trip. Somebody changing
 * hotels on day three also checks out in the morning and has nothing booked,
 * and they genuinely do need the prompt — that night is a real gap and this
 * row is the only thing that would tell them.
 *
 * So the question is not 「did you check out」, it is 「is there another night」.
 */

export type StayRowState =
  /** A room is booked; the row shows it. */
  | 'booked'
  /** No room, and a night still to come: a gap worth pointing at. */
  | 'missing'
  /** No room and no night left — checked out and going home. */
  | 'checked_out';

export interface StayRowInput {
  /** The day being looked at, YYYY-MM-DD. */
  date?: string;
  /** The trip's last day, YYYY-MM-DD. */
  endDate?: string;
  /** Whether a stay covers this night. */
  hasStay: boolean;
}

/**
 * Which of the three this day is.
 *
 * The last day is decided by the trip's end date rather than by 「is there a
 * later day with a booking」, because the absence of a later booking is
 * exactly the state this is trying to tell apart. A trip that ends on the 7th
 * has no night of the 7th to sleep through, whatever is or is not booked.
 *
 * Without an end date nothing can be concluded, and the prompt stays: a trip
 * with no dates is being planned, and that is when an unbooked night is most
 * worth showing.
 */
export const stayRowState = ({ date, endDate, hasStay }: StayRowInput): StayRowState => {
  if (hasStay) return 'booked';
  const day = (date || '').slice(0, 10);
  const end = (endDate || '').slice(0, 10);
  if (!day || !end) return 'missing';
  // On or past the last day there is no night left to book.
  return day >= end ? 'checked_out' : 'missing';
};

/** 今日退房, in the traveller's words. */
// i18n-data: rendered as a bare constant by `ItineraryCalendar`, which is
// outside this batch; migrating it needs that call site to resolve a key.
export const CHECKED_OUT_LABEL = '今日退房'; // i18n-data: rendered as a bare constant by ItineraryCalendar, outside this batch
