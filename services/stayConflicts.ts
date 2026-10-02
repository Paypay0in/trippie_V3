import { ItineraryItem } from '../types';

/**
 * Two bookings that cannot both be true.
 *
 * 「住房資訊重複了好幾個，要自動 pop up 詢問用戶哪個是正確的」. One hotel, uploaded
 * twice — once as 廣安里凱星頓特酒店 and once as Kent Hotel Gwangalli by
 * Kensington — produced four cards for one room: two identical check-ins and
 * two check-outs under different names for the same night.
 *
 * Name matching cannot catch that; the two names share nothing. What gives it
 * away is that they claim the same slot: a traveller does not check into two
 * hotels at 21:55 on the same evening, and does not check out of two at 11:00
 * on the same morning.
 *
 * So nothing here guesses which one is right. It finds the cards that contradict
 * each other and hands the choice to the person holding the booking email.
 */

const CHECK_IN_PREFIX = '入住 ';
const CHECK_OUT_PREFIX = '退房 ';

export type StayRole = 'check_in' | 'check_out';

export interface StayConflict {
  /** `${date}|${role}` — the slot being claimed twice. */
  id: string;
  date: string;
  role: StayRole;
  /** The cards claiming it, in the order they appear on the itinerary. */
  items: ItineraryItem[];
}

export const isStayItem = (item: ItineraryItem): boolean =>
  item.type === 'HOTEL' && item.fixedEventKind === 'accommodation';

export const stayRoleOf = (item: ItineraryItem): StayRole | undefined => {
  if (item.title?.startsWith(CHECK_IN_PREFIX)) return 'check_in';
  if (item.title?.startsWith(CHECK_OUT_PREFIX)) return 'check_out';
  return undefined;
};

/** The property name without the 入住／退房 prefix, for showing the choice. */
export const stayPropertyName = (item: ItineraryItem): string => {
  const role = stayRoleOf(item);
  if (role === 'check_in') return item.title.slice(CHECK_IN_PREFIX.length).trim();
  if (role === 'check_out') return item.title.slice(CHECK_OUT_PREFIX.length).trim();
  return item.title?.trim() || '';
};

/**
 * Every slot claimed by more than one booking.
 *
 * Deliberately keyed on the day and the role rather than on the clock: the same
 * booking uploaded twice can land at different times if one copy was parsed
 * from a screenshot and the other typed by hand, and they are still the same
 * night. Two genuinely different hotels on one day are the rare case, and
 * asking about them costs one tap.
 */
export const findStayConflicts = (items: ItineraryItem[]): StayConflict[] => {
  const slots = new Map<string, StayConflict>();

  items.forEach(item => {
    if (!isStayItem(item) || !item.date) return;
    const role = stayRoleOf(item);
    if (!role) return;
    const id = `${item.date}|${role}`;
    const slot = slots.get(id) || { id, date: item.date, role, items: [] };
    slot.items.push(item);
    slots.set(id, slot);
  });

  return Array.from(slots.values())
    .filter(slot => slot.items.length > 1)
    .sort((left, right) => left.id.localeCompare(right.id));
};

/**
 * The ids to delete once the traveller has said which booking is the real one.
 *
 * Keeping a property means keeping every card that names it, across all the
 * conflicting slots — picking the right hotel at check-in and then being asked
 * again at check-out would be the same question twice.
 */
export const idsToDropForChoice = (
  conflicts: StayConflict[],
  keptPropertyName: string,
): string[] => {
  const kept = keptPropertyName.trim();
  if (!kept) return [];
  return conflicts
    .flatMap(conflict => conflict.items)
    .filter(item => stayPropertyName(item) !== kept)
    .map(item => item.id);
};

/**
 * Duplicate cards of the property being kept — the same booking entered twice.
 *
 * One of them is the booking and the rest are copies of it, so all but the
 * first in each slot go. This is separate from the choice above: that one is
 * about which hotel, this one is about how many times it was entered.
 */
export const idsToDropAsCopies = (
  conflicts: StayConflict[],
  keptPropertyName: string,
): string[] => {
  const kept = keptPropertyName.trim();
  return conflicts.flatMap(conflict => conflict.items
    .filter(item => stayPropertyName(item) === kept)
    .slice(1)
    .map(item => item.id));
};
