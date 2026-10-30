import i18n from '../i18n/config';
import { Friendship, Person } from './friendships';

/**
 * People you have already travelled with, offered as friends.
 *
 * 「gina已經是跟我有共同建立旅行本的人 是不是可以直接新增成朋友」.
 *
 * Yes — and it removes the one awkward step in B. Asking somebody to type the
 * email of a person they planned a trip with is asking for a fact they have no
 * reason to know; they know her as 「Gina」, the name on the seat.
 *
 * Two decisions worth stating, because they are the whole of this file.
 *
 * It suggests; it does not befriend. Sharing a trip and being friends are not
 * the same permission: a trip is one itinerary two people agreed to, and
 * friendship opens every 好友可見 post, past and future. Somebody splits a trip
 * with a colleague, a landlord, an ex. Turning a shared itinerary into standing
 * access to a feed is a decision neither person made, and it would be made
 * retroactively over posts already written. So a suggestion, one tap, and the
 * other person still accepts.
 *
 * The seats must come from the server, not from the local roster. A device
 * holds the roster it created, and `user_id` is attached server-side when an
 * invite is claimed — so the owner's own copy of Gina's seat may have no
 * account on it at all. Reading the local list would suggest nobody, on the
 * device most likely to have companions.
 */

/** A seat on a trip, as the server holds it. */
export interface CompanionSeat {
  /** The account on the seat, or undefined for a seat nobody has claimed. */
  userId?: string;
  name: string;
  tripId: string;
  /** For 「一起去過 ___」, when the trip is known by name. */
  tripName?: string;
}

export interface CompanionSuggestion {
  userId: string;
  name: string;
  /** Trip names, in first-seen order, for saying where you met. */
  tripNames: string[];
  /** How many trips you have shared, named or not. */
  tripCount: number;
}

export interface SuggestionContext {
  /** The signed-in account. Without it nothing can be excluded, so nothing is offered. */
  me?: string;
  /** Accounts already accepted as friends. */
  friendIds?: string[];
  /** Every friendship touching this account, pending included. */
  friendships?: Friendship[];
}

/**
 * Everyone this account has an open or settled friendship with.
 *
 * Both columns, both statuses. Reading one column is how a sent invitation
 * stays in the suggestion list and gets sent twice; reading only `accepted` is
 * how somebody re-invites a person who has not answered yet, which to the
 * person who has not answered looks like being asked twice.
 */
const alreadySpokenFor = (context: SuggestionContext): Set<string> => {
  const ids = new Set(context.friendIds || []);
  for (const row of context.friendships || []) {
    if (row.requesterId === context.me) ids.add(row.addresseeId);
    else if (row.addresseeId === context.me) ids.add(row.requesterId);
  }
  return ids;
};

/**
 * The suggestions, in first-seen order.
 *
 * One entry per person, not per seat: somebody you have taken three trips with
 * is one friend, and listing her three times makes the shortcut look broken.
 */
export const companionSuggestions = (
  seats: CompanionSeat[],
  context: SuggestionContext = {},
): CompanionSuggestion[] => {
  if (!context.me) return [];
  const skip = alreadySpokenFor(context);
  const byPerson = new Map<string, CompanionSuggestion>();
  const seenTrips = new Map<string, Set<string>>();

  for (const seat of seats) {
    // An unclaimed seat is a name the owner typed. There is no account to
    // befriend, and inventing one from the name would reach the wrong person.
    if (!seat.userId) continue;
    if (seat.userId === context.me) continue;
    if (skip.has(seat.userId)) continue;

    const existing = byPerson.get(seat.userId);
    if (!existing) {
      byPerson.set(seat.userId, {
        userId: seat.userId,
        // Display-only: `asPerson` feeds the panel, and `requestFriend` writes
        // the two ids and no name, so this never reaches storage.
        name: seat.name || i18n.t('app.label.traveller'),
        tripNames: seat.tripName ? [seat.tripName] : [],
        tripCount: 1,
      });
      seenTrips.set(seat.userId, new Set([seat.tripId]));
      continue;
    }

    // Two seats for one person on one trip is a duplicate, not a second trip.
    const trips = seenTrips.get(seat.userId)!;
    if (trips.has(seat.tripId)) continue;
    trips.add(seat.tripId);
    existing.tripCount += 1;
    if (seat.tripName && !existing.tripNames.includes(seat.tripName)) {
      existing.tripNames.push(seat.tripName);
    }
  }

  return Array.from(byPerson.values());
};

/** 「一起去過 日本東京」, or a count when the trips have no names. */
export const metOnLabel = (suggestion: CompanionSuggestion): string => {
  if (suggestion.tripNames.length === 0) {
    return i18n.t('friends.metOnTripCount', { count: suggestion.tripCount });
  }
  const [first] = suggestion.tripNames;
  const rest = suggestion.tripCount - 1;
  return rest > 0
    ? i18n.t('friends.metOnTripAndMore', { trip: first, count: suggestion.tripCount })
    : i18n.t('friends.metOnTrip', { trip: first });
};

/** A suggestion is a person, for the panel that already knows how to draw one. */
export const asPerson = (suggestion: CompanionSuggestion): Person => ({
  id: suggestion.userId,
  displayName: suggestion.name,
});
