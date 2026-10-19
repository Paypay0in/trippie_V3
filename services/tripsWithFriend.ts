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
  /**
   * The roster as the cloud holds it. Built when the trip is created and when
   * it is archived — and not in between.
   */
  members?: Array<{ id?: string; userId?: string }>;
  /**
   * The roster as the traveller edits it.
   *
   * 「目前我跟他一起有的行程：東京」, and the page said 0. 諮 was added to 東京
   * after it was created, and adding somebody writes `companions` — `members`
   * is a snapshot taken at creation and at archive, so it still described the
   * day the trip was made.
   *
   * Both are read here. One of them is always the stale one, and which one it
   * is depends on when the person was added, so a screen that reads only one
   * is wrong for half the trips in the list.
   */
  companions?: Array<{ id?: string; userId?: string }>;
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
 * Matched on an id, never on the name somebody typed: 「Gina」 on a roster is a
 * seat that may or may not belong to an account, and pairing by name would
 * show a trip they were invited to and never joined.
 *
 * Two ids count, because the app already treats both as 「this seat is that
 * account」: `userId`, written when an invite is claimed, and the seat's own
 * `id` where it was created as the friend themselves — which is what
 * `CompanionsModal` reads when it draws 已連結好友.
 *
 * 「Gina 跟我一起去釜山呀」 — a seat on an older trip may carry neither, and
 * then this is empty and correct: nothing in the data says that Gina is this
 * account rather than somebody with the same name.
 */
export const tripsWithFriend = (trips: TripLike[], friendUserId: string): SharedTrip[] => {
  if (!friendUserId) return [];
  const seen = new Set<string>();

  /*
    What makes two rows the same trip.

    The id, and then the name and the dates. Drafts and history hold the same
    journey, and the copy that was archived does not always carry the id the
    draft had — so 「Tokyo 2026/10/20 – 10/24」 arrived twice, which is not a
    list of two trips, it is the same trip seen from two shelves.

    Two genuinely different journeys sharing a name and both ends of their
    dates is not something a traveller has; one of them showing is a better
    wrong than both.
  */
  const identities = (trip: TripLike): string[] => [
    `id:${trip.id}`,
    `trip:${(trip.name || trip.destination || '').trim()}|${trip.startDate || ''}|${trip.endDate || ''}`,
  ];

  return trips
    .filter(trip => [...(trip.members || []), ...(trip.companions || [])].some(member =>
      member.userId === friendUserId || member.id === friendUserId))
    .filter(trip => {
      const keys = identities(trip);
      if (keys.some(key => seen.has(key))) return false;
      keys.forEach(key => seen.add(key));
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
