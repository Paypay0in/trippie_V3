import { ShoppingItem } from '../types';
import i18n from '../i18n/config';

/**
 * The bookings and tickets on the plan, as errands somebody else could run.
 *
 * 「這邊就是可以服務功能可以出現的地方～ 可以發包要求給別人」.
 *
 * A table at a 予約制 restaurant is the clearest case the marketplace has: the
 * form is in Japanese, it opens a month ahead, and it is the thing a traveller
 * cannot do from here. The errand flow already exists for the shopping to-dos,
 * so this joins it rather than growing a second one.
 *
 * Shaped as tasks because that is what the request sheet speaks. Nothing is
 * ever written back to them — `ServiceRequestTask` keeps a name snapshot
 * precisely because its source may not be a synced record, which is true of
 * these by design: they are derived from the plan every time it is read.
 */

export interface TicketErrandInput {
  itemId: string;
  placeName: string;
  kind: 'ticket' | 'booking';
  date?: string;
  bookingUrl?: string;
}

/** Prefixed, so a synthetic id can never collide with a shopping to-do's. */
export const ERRAND_ID_PREFIX = 'ticket:';

const dayLabel = (date?: string): string =>
  (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `（${date.slice(5).replace('-', '/')}）` : '');

export const ticketErrands = (todos: TicketErrandInput[]): ShoppingItem[] =>
  todos.map(todo => ({
    id: `${ERRAND_ID_PREFIX}${todo.itemId}`,
    /*
      What the job is, in the first two characters.

      Whoever picks this up reads a list of names. 「Yoroniku」 says nothing
      about whether they are booking a table or buying a ticket, and those are
      different errands at different places.
    */
    name: i18n.t(todo.kind === 'booking' ? 'marketplace.errand.bookTable' : 'marketplace.errand.buyTicket', {
      place: todo.placeName,
      day: dayLabel(todo.date),
    }),
    isPurchased: false,
    phase: 'pre' as const,
    ...(todo.bookingUrl ? { description: i18n.t('marketplace.errand.reference', { url: todo.bookingUrl }) } : {}),
  }));
