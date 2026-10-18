/**
 * A stop that would make more sense on a different day.
 *
 * 「也能讓 AI 讀取其他日的行程 假設某個行程移去另一天更順 也可以建議」.
 *
 * 優化動線 already moves whole areas between days — that is what
 * `assignAreasToDays` does. What it cannot say is 「this one stop, on its own,
 * belongs with Thursday」: an area of one has no majority to move, and a stop
 * that happens to sit near another day's route is invisible to a rule about
 * areas.
 *
 * Suggested, never applied. Which day somebody wants to do something on is not
 * only a distance question — a booking, the weather, who they are meeting —
 * and the plan this appears in is already a proposal. Two layers of silent
 * rearrangement is one too many.
 */
import { ItineraryItem } from '../types';
import { dayDistanceKm, isAnchored, kmBetween } from './optimiseTripRoute';
import { stopsOnTheGround } from './dayMapImage';

/**
 * How much shorter the trip has to get before this is worth saying.
 *
 * A kilometre and a half is roughly twenty minutes on foot, or a train ride
 * with a change in it. Below that the suggestion is noise: it asks somebody to
 * reconsider their Tuesday to save a walk they would not notice.
 */
export const WORTH_MOVING_KM = 1.5;

interface Point { latitude: number; longitude: number }

const located = (item: ItineraryItem): item is ItineraryItem & Point =>
  typeof item.latitude === 'number' && typeof item.longitude === 'number';

const byClock = (items: ItineraryItem[]): ItineraryItem[] =>
  [...items].sort((left, right) => (left.time || '').localeCompare(right.time || ''));

/**
 * The least a day grows by, fitting one more stop into it anywhere.
 *
 * Cheapest insertion, including both ends — a stop that belongs at the start
 * of a day is exactly the case a middles-only search would miss.
 */
const cheapestInsertionKm = (day: Array<ItineraryItem & Point>, stop: Point): number => {
  if (day.length === 0) return 0;
  if (day.length === 1) return kmBetween(day[0], stop);

  let best = Infinity;
  // Before the first and after the last: one new leg each.
  best = Math.min(best, kmBetween(stop, day[0]), kmBetween(day[day.length - 1], stop));
  for (let index = 1; index < day.length; index += 1) {
    const detour = kmBetween(day[index - 1], stop)
      + kmBetween(stop, day[index])
      - kmBetween(day[index - 1], day[index]);
    best = Math.min(best, detour);
  }
  return best;
};

export interface DayMoveSuggestion {
  itemId: string;
  placeName: string;
  fromDate: string;
  toDate: string;
  /** Kilometres the whole trip would save. Rounded to one decimal. */
  savesKm: number;
}

/**
 * Stops the trip would walk less for if they changed day.
 *
 * One suggestion per stop, the best one, and only where the saving clears
 * `WORTH_MOVING_KM`. Anchors are never suggested: a flight, a check-in and
 * anything pinned are what the days are built around.
 */
export const betterOnAnotherDay = (items: ItineraryItem[]): DayMoveSuggestion[] => {
  const ground = new Set(stopsOnTheGround(items).map(item => item.id));
  const movable = items.filter(item =>
    item.date && located(item) && !isAnchored(item) && ground.has(item.id));
  if (movable.length === 0) return [];

  const dates = Array.from(new Set(items.map(item => item.date).filter(Boolean))).sort();
  if (dates.length < 2) return [];

  const dayStops = new Map<string, Array<ItineraryItem & Point>>();
  dates.forEach(date => {
    dayStops.set(date, byClock(movable.filter(item => item.date === date)) as Array<ItineraryItem & Point>);
  });

  const suggestions: DayMoveSuggestion[] = [];

  movable.forEach(stop => {
    const own = dayStops.get(stop.date) || [];
    /*
      A day of one is not made shorter by emptying it — it is made empty, and
      the stop has nowhere to have been. Suggesting that is suggesting the day
      be deleted, which is not what was asked.
    */
    if (own.length < 2) return;

    const withoutIt = dayDistanceKm(own.filter(entry => entry.id !== stop.id));
    const saved = dayDistanceKm(own) - withoutIt;

    let best: DayMoveSuggestion | undefined;
    dates.forEach(date => {
      if (date === stop.date) return;
      const target = dayStops.get(date) || [];
      // An empty day would take it for free, which is true and useless: it is
      // a day nobody has planned, not a better home for this stop.
      if (target.length === 0) return;

      const added = cheapestInsertionKm(target, stop as Point);
      const net = saved - added;
      if (net < WORTH_MOVING_KM) return;
      if (best && best.savesKm >= net) return;
      best = {
        itemId: stop.id,
        placeName: stop.location || stop.title || '',
        fromDate: stop.date as string,
        toDate: date,
        savesKm: Math.round(net * 10) / 10,
      };
    });

    if (best) suggestions.push(best);
  });

  // Biggest saving first: a list read top down should start with the one worth
  // acting on.
  return suggestions.sort((left, right) => right.savesKm - left.savesKm);
};
