/**
 * Tickets this traveller has already bought.
 *
 * 「這裡要能夠跳出購票連結 並且像代辦清單 要可以打勾的」.
 *
 * The list of places needing a ticket is derived from the itinerary and must
 * stay derived — it is recomputed from what is planned, so it cannot go stale.
 * 「I bought that one」 is the opposite: nothing in the plan implies it, so it
 * is the one fact here that has to be stored.
 *
 * Stored on the device, for now. The itinerary syncs through flat columns, so
 * a shared tick needs `ticket_bought` on `itinerary_items` — the migration is
 * queued with the others and nothing is wired into `tripSyncMapping` before
 * the column exists. Until then the mark survives a reload on the phone that
 * made it and does not travel, which is said on the panel rather than implied.
 *
 * Keyed by itinerary item id, not by place: the same museum on two trips is
 * two tickets.
 */

export const TICKETS_BOUGHT_STORAGE_KEY = 'trippie_tickets_bought_v1';

export const loadBoughtTickets = (): string[] => {
  try {
    const raw = localStorage.getItem(TICKETS_BOUGHT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && Boolean(id))
      : [];
  } catch {
    return [];
  }
};

/** Returns the next list, so a caller can put it straight into state. */
export const toggleBoughtTicket = (current: string[], itemId: string): string[] => {
  if (!itemId) return current;
  const next = current.includes(itemId)
    ? current.filter(id => id !== itemId)
    : [...current, itemId];
  try {
    localStorage.setItem(TICKETS_BOUGHT_STORAGE_KEY, JSON.stringify(next.slice(-500)));
  } catch {
    // A blocked store costs the tick on reload, which is where it started.
  }
  return next;
};
