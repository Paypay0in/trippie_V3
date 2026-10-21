/**
 * Blocks the traveller has said are meant to be empty.
 *
 * 「要有『無』的選項」 — on an empty row. A filled block could already be cleared
 * back to nothing (`onClearBlock`), but a block that was never filled had no
 * way to say 「我今天中午不吃」. So the planner went on offering 佐藤養助 and
 * Kamo to Negi under a gap the traveller had already decided about, every time
 * the day was opened.
 *
 * The distinction is the whole point: an empty block means 「nobody has chosen
 * yet」 and an emptied one means 「there is nothing here on purpose」. They look
 * identical in an itinerary, which is why this has to be recorded rather than
 * derived — no arrangement of the day's items can tell them apart.
 *
 * Keyed by `DaySlot.id`, which is already 「date#position」 and is stable for a
 * given day and position by construction. A mark on a block that later gains
 * an occupant does nothing: only an empty row reads this, so a filled block
 * can never hide behind a decision made when it was empty.
 *
 * Device-local, like `statedVisits`. The `trips` row has no column for this,
 * and the standing rule is that nothing is wired to a column before the column
 * exists.
 */
const STORAGE_KEY = 'trippie_emptied_slots_v1';

/** The ids of blocks declared empty, as a set in list form. */
export type EmptiedSlots = string[];

export const loadEmptiedSlots = (storage?: Storage): EmptiedSlots => {
  const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    // A plan that cannot read one key is still a plan.
    return [];
  }
};

export const saveEmptiedSlots = (slots: EmptiedSlots, storage?: Storage): void => {
  const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // Out of quota or private mode. Losing the mark is survivable; throwing in
    // the middle of a tap is not.
  }
};

export const isEmptied = (slots: EmptiedSlots, slotId: string): boolean =>
  slots.includes(slotId);

/**
 * Says a block is empty on purpose, or takes that back.
 *
 * Both directions, because 「無」 is a decision and a traveller is allowed to
 * change their mind about lunch.
 */
export const toggleEmptied = (slots: EmptiedSlots, slotId: string): EmptiedSlots =>
  slots.includes(slotId) ? slots.filter(id => id !== slotId) : [...slots, slotId];
