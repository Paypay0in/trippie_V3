import { ItineraryItem, ItineraryVisibility, TripMember } from '../types';

/**
 * Whose plan an itinerary item is.
 *
 * 「行程並不是所有人的都會相同，所以要有可以共享本行程或是個人行程的選項」, and
 * 「你的朋友可以在他的行程表上看到你的行程」.
 *
 * Two travellers on one trip do not do the same things all day. Until now the
 * itinerary assumed they did: one list, every item everybody's, so a haircut
 * that only concerned one of them either sat on both plans as though it were
 * joint, or was left off and lost.
 *
 * So an item is either 共同 — the trip's, which is what everything already in
 * the itinerary is — or 個人, one person's. A personal item is *not* hidden from
 * the other traveller: that is the whole point of the third request. It is
 * shown, attributed, and kept out of their own day, so they can see that Gina
 * is booked at 14:00 without 14:00 being taken on their plan.
 */

export type { ItineraryVisibility };

/**
 * Shared unless it says otherwise.
 *
 * Every item that existed before this field did was everybody's, and an absent
 * value has to keep meaning that — a migration that silently turned the
 * existing plan into one person's private list would take the trip away from
 * whoever opened it second.
 */
export const visibilityOf = (item: Pick<ItineraryItem, 'visibility'>): ItineraryVisibility =>
  (item.visibility === 'personal' ? 'personal' : 'shared');

export const isPersonal = (item: Pick<ItineraryItem, 'visibility'>): boolean =>
  visibilityOf(item) === 'personal';

/**
 * Whether this item is one of the viewer's own.
 *
 * A shared item is everybody's own. A personal one belongs to whoever it says —
 * and a personal item with no owner recorded is treated as the viewer's rather
 * than as nobody's, because an unattributed private item would otherwise
 * disappear from the only plan it could belong to.
 */
export const isOwnItem = (
  item: Pick<ItineraryItem, 'visibility' | 'ownerUserId'>,
  viewerUserId?: string,
): boolean => {
  if (!isPersonal(item)) return true;
  if (!item.ownerUserId) return true;
  return Boolean(viewerUserId) && item.ownerUserId === viewerUserId;
};

/**
 * Whether this item occupies the viewer's day.
 *
 * What the block planner, the area colours and the AI planner all run on. The
 * rule has to be exactly 「mine」 rather than 「visible」: someone else's
 * appointment is worth seeing, but if it filled a block the planner would
 * refuse to put anything there, and the day would read as full when it is free.
 */
export const occupiesOwnDay = (
  item: Pick<ItineraryItem, 'visibility' | 'ownerUserId'>,
  viewerUserId?: string,
): boolean => isOwnItem(item, viewerUserId);

/** The viewer's own plan, and what their companions are doing alongside it. */
export interface DayPartition {
  mine: ItineraryItem[];
  theirs: ItineraryItem[];
}

/**
 * Splits a day into the viewer's plan and everyone else's personal items.
 *
 * Both halves keep the order they arrived in: the caller has already sorted the
 * day, and re-sorting here would quietly disagree with the timeline.
 */
export const partitionDayByViewer = (items: ItineraryItem[], viewerUserId?: string): DayPartition => ({
  mine: items.filter(item => occupiesOwnDay(item, viewerUserId)),
  theirs: items.filter(item => !occupiesOwnDay(item, viewerUserId)),
});

/**
 * Who to say an item belongs to, when that needs saying.
 *
 * Undefined for a shared item and for the viewer's own — labelling those would
 * put a name on every row and so make the name mean nothing. Falls back to
 * 同行者 rather than to a user id: an id tells the reader less than nothing.
 */
export const ownerLabelFor = (
  item: Pick<ItineraryItem, 'visibility' | 'ownerUserId'>,
  members: TripMember[],
  viewerUserId?: string,
): string | undefined => {
  if (!isPersonal(item)) return undefined;
  if (isOwnItem(item, viewerUserId)) return undefined;
  const named = members.find(member => member.userId && member.userId === item.ownerUserId);
  return named?.name?.trim() || '同行者';
};

/** What a personal item of the viewer's own is called on their own plan. */
export const OWN_PERSONAL_LABEL = '我的個人行程';
