/**
 * Which saved places have already been visited, and when.
 *
 * 「收藏的筆記中，若某次旅行有去過。要記錄：去的時間，並標註『已訪』」.
 *
 * Derived, never stored. The app already holds the answer: a trip that has
 * finished, with that place on one of its days. Storing 「visited」 as a field on
 * the saved place would be a seventh thing for the four rebuilders in this
 * codebase to drop — the merge, the sync, the localStorage loader and the
 * backfill's argument — which is the shape of every bug in this area tonight.
 * A fact that can be recomputed cannot go stale and cannot be lost.
 *
 * The date is the day it was on the plan, not the day anything was ticked:
 * 「去的時間」 is a date the traveller can recognise, and a completion checkbox
 * is only ever ticked by the people who tick checkboxes.
 */
import { Expense, ItineraryItem, SavedTravelInspiration, Trip } from '../types';

export interface PlaceVisit {
  /** The day it was on the plan, `YYYY-MM-DD`. */
  date: string;
  /** The trip it belonged to, for saying which journey it was. */
  tripName?: string;
  /**
   * True when the traveller said so rather than a trip showing it.
   *
   * Carried because the two know different things. A plan knows the day; a
   * tick knows only that it happened, and `date` here is the day it was
   * ticked. Labelling that as 「已訪 · 2026」 would put a year on the screen
   * that nobody claimed.
   */
  stated?: boolean;
}

/**
 * The identity two records are matched on.
 *
 * Both the resolved Google id and the trimmed lowercased name, not one or the
 * other.
 *
 * 「去過的要標記」 over a 釜山 collection with no 已訪 on it. The old rule took the
 * id when there was one and the name otherwise — so a saved place that had
 * been resolved and an itinerary item that never was produced two different
 * keys for the same restaurant, and the visit was invisible.
 *
 * That is the common case rather than an edge: the collection has been through
 * a backfill and old itineraries have not. Indexing under every identity a
 * record has costs one extra map entry and makes the match work in both
 * directions.
 */
export const placeIdentities = (place: { placeId?: string; placeName?: string; location?: string; title?: string }): string[] => {
  const keys: string[] = [];
  const id = place.placeId?.trim();
  if (id) keys.push(`place:${id}`);
  const name = (place.placeName || place.location || place.title || '').trim().toLocaleLowerCase();
  if (name) keys.push(`name:${name}`);
  return keys;
};

/** The one rule for 「are these two records the same place」. */
const keysOf = placeIdentities;

/** A day that has already happened. Today still counts as happening. */
const isPast = (date: string, today: string): boolean =>
  Boolean(date) && date < today;

/**
 * Every visited place, keyed by identity, carrying the most recent visit.
 *
 * @param trips the traveller's own finished and in-progress journeys.
 * @param today `YYYY-MM-DD`; a day that has not arrived is not a visit.
 * @param stated what the traveller has said themselves. See `statedVisits`.
 * @param expenses bills already tied to a place. See below.
 */
export const visitsByPlace = (
  trips: Array<Pick<Trip, 'name' | 'itinerary'>>,
  today: string,
  stated: Readonly<Record<string, string>> = {},
  expenses: Array<Pick<Expense, 'date' | 'merchantPlaceId'>> = [],
): Map<string, PlaceVisit> => {
  const visits = new Map<string, PlaceVisit>();

  /*
    What the traveller said, first, so a plan can still correct the date.

    Derivation answers 「did a finished trip take you there」 and nothing else.
    「下方兩個我去過了」 is the rest of the world: a place visited before this app
    existed, on somebody else's trip, or on an afternoon nobody wrote down. The
    collection is the traveller's own record, so it has to be able to hold what
    only they know — the same correction as the ticket list, which I also
    refused to let anyone tick.
  */
  Object.entries(stated).forEach(([key, date]) => {
    if (date) visits.set(key, { date, stated: true });
  });

  /*
    A bill is a visit. 「已訪太少了吧 有缺」.

    This answered two questions — 「did a trip take you there」 and 「did you
    say so」 — and ignored the third, which is the most certain of the three:
    somebody who paid at a place was standing in it. 「哪一筆是在這裡花的？」
    writes `merchantPlaceId` onto the bill, and that is the traveller
    themselves saying which door the money went through.

    Only a stated `merchantPlaceId`. `spendAtPlace` will also match a bill by
    its merchant name or its street number, which is right for 「what did this
    place cost」 and too loose for 「was I here」 — a near-miss there shows a
    number beside the wrong shop, and a near-miss here writes 已訪 onto a
    restaurant somebody has never been to.
  */
  expenses.forEach(expense => {
    const placeId = (expense.merchantPlaceId || '').trim();
    const date = (expense.date || '').trim();
    if (!placeId || !date) return;
    const key = `place:${placeId}`;
    const existing = visits.get(key);
    if (!existing || existing.stated || existing.date < date) {
      visits.set(key, { date });
    }
  });

  trips.forEach(trip => {
    (trip.itinerary || []).forEach((item: ItineraryItem) => {
      /*
        A ticked stop is a visit, whatever the calendar says.

        「若按完成 我希望我點回我的收藏清單 可以看到他被標註已訪」 — the date rule
        answers 「has this day been and gone」, which is the right question for
        a plan nobody has touched. It is the wrong question once somebody has
        said they went: 完成 on this afternoon's stop is a statement, and
        making it wait until midnight to count is the screen arguing with the
        person who was there.

        Same correction as the ticket list, and for the same reason: a to-do
        list records what the traveller says.
      */
      if (!isPast(item.date, today) && item.isCompleted !== true) return;
      keysOf(item).forEach(key => {
        const existing = visits.get(key);
        /*
          The most recent visit: 「上次去是什麼時候」 is the question being asked.

          A trip always wins over a tick, whatever the dates say. The tick's
          date is the day it was ticked, so comparing the two would let
          「I marked this today」 hide 「you went in March」 — which is the one
          thing on this chip the traveller can recognise.
        */
        if (!existing || existing.stated || existing.date < item.date) {
          visits.set(key, { date: item.date, tripName: trip.name });
        }
      });
    });
  });

  return visits;
};

/** The visit for one saved place, if it has one. */
export const visitOf = (
  place: Pick<SavedTravelInspiration, 'placeId' | 'placeName'>,
  visits: Map<string, PlaceVisit>,
): PlaceVisit | undefined => {
  // Either identity will do: whichever of the two records carries one.
  for (const key of keysOf(place)) {
    const visit = visits.get(key);
    if (visit) return visit;
  }
  return undefined;
};

/**
 * 「已訪 · 2026」.
 *
 * 「去過的要標記🏷️ 並寫下旅行年份」 — the year, not the day. A collection is
 * scanned rather than read, and 「did I go, and roughly when」 is the question
 * being answered; 2026/03/22 makes somebody parse a date to learn 2026.
 *
 * The exact day is still on the visit for anywhere that wants it.
 */
export const visitLabel = (visit?: PlaceVisit): string => {
  if (!visit) return '';
  // No year on a visit nobody dated. See `PlaceVisit.stated`.
  return visit.stated ? '已訪' : `已訪 · ${visit.date.slice(0, 4)}`;
};
