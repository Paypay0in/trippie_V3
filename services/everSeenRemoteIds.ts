/**
 * The rows this device has ever seen on the server.
 *
 * 「刪掉的帳又一直出現了」.
 *
 * Two questions look alike and are opposites. A record that is on this phone
 * and not on the server is either *new here and not sent yet* — keep it, push
 * it — or *deleted by the other traveller* — let it go. The only thing that
 * tells them apart is whether this device ever saw the server holding it.
 *
 * It was answering with the latest snapshot, which cannot express that: the
 * moment Gina deletes a bill, the next read on his phone says 「the server does
 * not have it」, and 「never seen it」 and 「just watched it disappear」 become the
 * same answer. His copy is then treated as unpushed and published again — and
 * because both phones do this to each other, the bill comes back every time.
 *
 * So the set only ever grows, and it outlives a reload. A deletion is not a
 * row anywhere; the memory of having seen the row is the only record of it.
 */

export interface EverSeenIds {
  members: string[];
  expenses: string[];
  itinerary: string[];
  flightAnchors: string[];
  inspirations: string[];
}

export type EverSeenTable = keyof EverSeenIds;

export const EVER_SEEN_STORAGE_PREFIX = 'trippie_sync_seen_v1:';

const EMPTY: EverSeenIds = {
  members: [], expenses: [], itinerary: [], flightAnchors: [], inspirations: [],
};

/** Adds what the server just showed, keeping everything it showed before. */
export const rememberSeen = (
  previous: Iterable<string> | undefined,
  seen: Iterable<string>,
): Set<string> => {
  const next = new Set(previous ?? []);
  for (const id of seen) next.add(id);
  return next;
};

/**
 * Capped, oldest first, because this is a dismissal record rather than history.
 *
 * A trip produces a few hundred rows at most; the cap exists so a device that
 * has opened many trips cannot grow this without bound.
 */
const CAP = 2000;

export const loadEverSeen = (tripId: string): EverSeenIds => {
  if (!tripId) return { ...EMPTY };
  try {
    const raw = localStorage.getItem(`${EVER_SEEN_STORAGE_PREFIX}${tripId}`);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Record<EverSeenTable, unknown>>;
    const clean: EverSeenIds = { ...EMPTY };
    (Object.keys(EMPTY) as EverSeenTable[]).forEach(table => {
      const value = parsed?.[table];
      clean[table] = Array.isArray(value)
        ? value.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
    });
    return clean;
  } catch {
    /*
      A corrupt store reads as 「never seen anything」.

      That is the safe direction: it keeps local records rather than dropping
      them, and the worst case is a deleted row reappearing once, which is
      exactly what this is for and will be corrected on the next read.
    */
    return { ...EMPTY };
  }
};

export const saveEverSeen = (tripId: string, ids: Partial<Record<EverSeenTable, Iterable<string>>>): void => {
  if (!tripId) return;
  try {
    const payload: EverSeenIds = { ...EMPTY };
    (Object.keys(EMPTY) as EverSeenTable[]).forEach(table => {
      payload[table] = Array.from(new Set(ids[table] ?? [])).slice(-CAP);
    });
    localStorage.setItem(`${EVER_SEEN_STORAGE_PREFIX}${tripId}`, JSON.stringify(payload));
  } catch {
    // A full or blocked store costs a deleted row coming back once. Not worth
    // failing a sync over.
  }
};

export const forgetEverSeen = (tripId: string): void => {
  try {
    localStorage.removeItem(`${EVER_SEEN_STORAGE_PREFIX}${tripId}`);
  } catch {
    // Nothing to do; the entry is keyed by trip and harmless if it lingers.
  }
};
