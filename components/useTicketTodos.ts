import { useEffect, useState } from 'react';
import { ItineraryItem, PlaceBookingOption } from '../types';
import { fetchPlaceCommerce, needsBookingAhead } from '../services/placeCommerceService';

/**
 * Places on the plan that have to be arranged before leaving.
 *
 * 「行程表上若有需要訂門票的景點或活動 就要放在前面的待辦事項欄位」, and then
 * 「安排的餐廳 有需要預約的 要放入行前規劃的待辦清單中」.
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
  /**
   * Whether the thing to do is buy a ticket or book a table.
   *
   * Read off the facts rather than guessed from the kind of place: a 予約制
   * restaurant has nothing to admit you through a gate, and a museum with
   * timed entry is still a ticket. 「需購票」 and 「需訂位」 are different
   * sentences and send somebody to different places.
   */
  kind: 'ticket' | 'booking';
  /** True where somebody checked that it cannot be bought at the door. */
  advanceBookingRequired?: boolean;
  /**
   * Where it can actually be bought.
   *
   * 「這裡要能夠跳出購票連結」 — a to-do that names the museum and stops there
   * leaves the traveller to go and find the page themselves, which is the
   * work. The itinerary card already resolves these: the official page where
   * one is known, and Klook/KKday searches labelled 搜尋 beside it.
   */
  bookingOptions?: PlaceBookingOption[];
}

export const useTicketTodos = (itinerary: ItineraryItem[]): TicketTodo[] => {
  const [todos, setTodos] = useState<TicketTodo[]>([]);

  /*
    A string, so this does not re-run on every render of a new array — the
    mistake that spun the planner's own effect into an infinite loop.
  */
  /*
    What the traveller already wrote down about the place.

    A curated entry knows 予約制; most restaurants have no entry at all, and
    the thing that does know is the note somebody saved with it — 「需提前預約」,
    「要先訂位」. That is the same sentence `needsBookingAhead` reads out of a
    curated entry's own notes, so it is read the same way here rather than
    with a second rule that would drift from it.
  */
  const bookedByNote = (item: ItineraryItem) =>
    (item.savedTravelNotes || []).some(note => needsBookingAhead(note.text || ''));

  const wanted = itinerary
    .filter(item => item.placeId)
    .map(item => [
      item.id,
      item.placeId,
      item.date || '',
      item.location || item.title || '',
      bookedByNote(item) ? 'note' : '',
    ].join(':'))
    .join('|');

  useEffect(() => {
    if (!wanted) { setTodos(current => (current.length === 0 ? current : [])); return; }
    let cancelled = false;

    void Promise.all(wanted.split('|').map(async (entry): Promise<TicketTodo | null> => {
      const [itemId, placeId, date, placeName, fromNote] = entry.split(':');
      const commerce = await fetchPlaceCommerce({ placeId, placeName });
      /*
        A table to book counts, not only a ticket to buy.

        This asked `admissionRequired` and nothing else, so a restaurant that
        cannot be walked into — 予約制, 完全予約制, 需事先訂位 — was invisible to
        the one panel whose job is 「what still has to be done」. Nobody is
        admitted to a restaurant; they are expected.
      */
      const needsTicket = commerce?.admissionRequired === true;
      const needsBooking = commerce?.advanceBookingRequired === true || fromNote === 'note';
      if (!needsTicket && !needsBooking) return null;
      return {
        itemId,
        placeName,
        kind: needsTicket ? 'ticket' as const : 'booking' as const,
        date: date || undefined,
        ...(commerce?.advanceBookingRequired === true ? { advanceBookingRequired: true } : {}),
        ...((commerce?.bookingOptions || []).length > 0
          ? { bookingOptions: commerce?.bookingOptions }
          : {}),
      };
    })).then(found => {
      if (cancelled) return;
      const needing = found.filter((entry): entry is TicketTodo => entry !== null);
      /*
        The ones that cannot be arranged on the day first, then by date: a list
        read top down should start with the one that can actually be missed.

        A booking is always one of those — a table nobody reserved is a table
        somebody else has — so it sorts with them rather than behind them.
      */
      const urgent = (todo: TicketTodo) =>
        Number(todo.kind === 'booking' || todo.advanceBookingRequired === true);
      setTodos(needing.sort((left, right) =>
        urgent(right) - urgent(left)
        || (left.date || '').localeCompare(right.date || '')));
    });

    return () => { cancelled = true; };
  }, [wanted]);

  return todos;
};
