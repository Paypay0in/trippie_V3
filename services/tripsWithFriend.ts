/**
 * The trips two people have taken together.
 *
 * 「然後點擊這個對象，應該要可以看到他跟我一起的旅行」.
 *
 * A friend row said a name and offered to remove them, which is the one
 * question nobody opens that screen to answer. What a friend is *for* here is
 * the trips their name is already on — the shared ledger, the itinerary both
 * phones write to.
 *
 * Derived from the trips this device already holds. Nothing is fetched and
 * nothing is stored: membership is on the trip, and a second list of 「who I
 * have travelled with」 would be a second answer to the same question.
 */

export interface TripLike {
  id: string;
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  members?: Array<{ userId?: string }>;
}

export interface SharedTrip {
  id: string;
  label: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Trips where this person is a member.
 *
 * Matched on `userId`, never on the name somebody typed: 「Gina」 on a roster is
 * a seat that may or may not have been claimed, and claiming it is exactly
 * what writes the id. Pairing the two by name would show a trip they were
 * invited to and never joined.
 */
export const tripsWithFriend = (trips: TripLike[], friendUserId: string): SharedTrip[] => {
  if (!friendUserId) return [];
  const seen = new Set<string>();

  return trips
    .filter(trip => (trip.members || []).some(member => member.userId === friendUserId))
    .filter(trip => {
      // Drafts and history can hold the same trip; it is one trip either way.
      if (seen.has(trip.id)) return false;
      seen.add(trip.id);
      return true;
    })
    .map(trip => ({
      id: trip.id,
      label: trip.name?.trim() || trip.destination?.trim() || '未命名的旅程',
      ...(trip.startDate ? { startDate: trip.startDate } : {}),
      ...(trip.endDate ? { endDate: trip.endDate } : {}),
    }))
    // Most recent first: the trip somebody is asking about is usually the last.
    .sort((left, right) => (right.startDate || '').localeCompare(left.startDate || ''));
};

/** 2026/10/20 – 10/24, or just the start when that is all there is. */
export const sharedTripDates = (trip: SharedTrip): string => {
  if (!trip.startDate) return '';
  const start = trip.startDate.replace(/-/g, '/');
  if (!trip.endDate || trip.endDate === trip.startDate) return start;
  /* The year once: both ends of a trip are nearly always in the same one. */
  const end = trip.endDate.slice(0, 4) === trip.startDate.slice(0, 4)
    ? trip.endDate.slice(5).replace('-', '/')
    : trip.endDate.replace(/-/g, '/');
  return `${start} – ${end}`;
};
