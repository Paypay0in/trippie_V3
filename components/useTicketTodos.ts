import { useEffect, useState } from 'react';
import { ItineraryItem } from '../types';
import { fetchPlaceCommerce } from '../services/placeCommerceService';

/**
 * Places on the plan that need a ticket buying.
 *
 * 「行程表上若有需要訂門票的景點或活動 就要放在前面的待辦事項欄位」.
 *
 * The itinerary card has said 需購票 on 東京都現代美術館 for hours. 旅程準備度,
 * the panel whose entire job is 「what still has to be done」, counted only the
 * shopping list — so the one thing that stops somebody getting in was on a
 * different screen from the list of things to do before going.
 *
 * Derived, never stored. The same rule 已訪 settled on: a fact that can be
 * recomputed cannot go stale and cannot be dropped by a rebuilder, and
 * `fetchPlaceCommerce` is already cached per place on both sides — the
 * itinerary screen usually warmed it before this one asked.
 */

export interface TicketTodo {
  itemId: string;
  placeName: string;
  date?: string;
  /** True where somebody checked that it cannot be bought at the door. */
  advanceBookingRequired?: boolean;
}

export const useTicketTodos = (itinerary: ItineraryItem[]): TicketTodo[] => {
  const [todos, setTodos] = useState<TicketTodo[]>([]);

  /*
    A string, so this does not re-run on every render of a new array — the
    mistake that spun the planner's own effect into an infinite loop.
  */
  const wanted = itinerary
    .filter(item => item.placeId)
    .map(item => `${item.id}:${item.placeId}:${item.date || ''}:${item.location || item.title || ''}`)
    .join('|');

  useEffect(() => {
    if (!wanted) { setTodos(current => (current.length === 0 ? current : [])); return; }
    let cancelled = false;

    void Promise.all(wanted.split('|').map(async (entry): Promise<TicketTodo | null> => {
      const [itemId, placeId, date, placeName] = entry.split(':');
      const commerce = await fetchPlaceCommerce({ placeId, placeName });
      if (!commerce?.admissionRequired) return null;
      return {
        itemId,
        placeName,
        date: date || undefined,
        ...(commerce.advanceBookingRequired === true ? { advanceBookingRequired: true } : {}),
      };
    })).then(found => {
      if (cancelled) return;
      const needing = found.filter((entry): entry is TicketTodo => entry !== null);
      /*
        The ones that cannot be bought at the door first, then by date: a list
        read top down should start with the one that can actually be missed.
      */
      setTodos(needing.sort((left, right) =>
        Number(Boolean(right.advanceBookingRequired)) - Number(Boolean(left.advanceBookingRequired))
        || (left.date || '').localeCompare(right.date || '')));
    });

    return () => { cancelled = true; };
  }, [wanted]);

  return todos;
};
