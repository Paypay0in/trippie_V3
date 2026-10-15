/**
 * The whole trip re-routed, as a planner would.
 *
 * 「我按下重排行程 就是要讓 AI 幫我重排並給我好的建議 … 那 AI 要像一個規劃人員重新
 * 幫我想行程 動線才對」, and 「連我手排的都給建議才對 除非我按下固定的行程」.
 *
 * Everything built today patched the model's output after the fact — overlaps,
 * missing times, wrong days, a lone outlier. None of it planned anything: the
 * model returned two moves and two moves were tidied. What was being asked for
 * is a plan.
 *
 * And routing is not a job for a language model. Three times today the same
 * thing held: scheduling, times and dates are right when they are arithmetic
 * and wrong when they are prose. A route is arithmetic too — it is 「assign
 * points with coordinates to days so each day walks least」, which is an
 * algorithm, not a sentence. The model keeps what only it can do: whether a
 * place is worth going to at all.
 *
 * Nothing here writes. It returns a proposal for the traveller to look at.
 */
import { ItineraryItem } from '../types';
import { clusterSavedPlaces } from './placeClusters';
import { stopsOnTheGround } from './dayMapImage';
import { durationOf, minutesToTime, timeToMinutes } from './itineraryTimeline';

/**
 * Flights, anything derived from one, check-ins, and anything pinned.
 *
 * 「除非我按下固定的行程 那才是不能動的」 — so `isPinned` is the traveller's own
 * answer to this question and is honoured exactly. The rest is the trip's
 * skeleton: a boarding pass is not a suggestion.
 */
export const isAnchored = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId)
  || item.type === 'FLIGHT'
  || Boolean(item.isPinned)
  // A check-in is the day's bookend rather than a stop on it.
  || item.type === 'HOTEL';

interface Point { latitude: number; longitude: number }

const EARTH_RADIUS_KM = 6371;

export const kmBetween = (left: Point, right: Point): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(right.latitude - left.latitude);
  const dLon = toRad(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(left.latitude)) * Math.cos(toRad(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

const located = (item: ItineraryItem): item is ItineraryItem & Point =>
  typeof item.latitude === 'number' && typeof item.longitude === 'number';

const centreOf = (points: Point[]): Point => ({
  latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
  longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
});

export interface RoutePlanDay {
  date: string;
  /** In the order they should be visited. */
  items: ItineraryItem[];
  /** How far the day walks, end to end, in kilometres. */
  distanceKm: number;
}

export interface RoutePlan {
  days: RoutePlanDay[];
  /** Items that could not be placed, with the reason. */
  unplaced: Array<{ item: ItineraryItem; reason: string }>;
  /** Total ground distance before and after, for saying whether it helped. */
  beforeKm: number;
  afterKm: number;
}

/** How far a day walks, visiting its items in order. */
export const dayDistanceKm = (items: ItineraryItem[]): number => {
  const points = items.filter(located);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += kmBetween(points[index - 1], points[index]);
  }
  return total;
};

/**
 * Orders one day's stops so it walks least, starting from where it starts.
 *
 * Nearest neighbour, which is not the shortest possible route and does not
 * need to be: the gain over 「whatever order they arrived in」 is most of the
 * available gain, and a traveller reading the day can see why each step
 * follows the last.
 */
export const orderByProximity = (
  items: ItineraryItem[],
  from?: Point,
): ItineraryItem[] => {
  const points = items.filter(located);
  const unlocated = items.filter(item => !located(item));
  if (points.length < 2) return items;

  const remaining = [...points];
  const ordered: Array<ItineraryItem & Point> = [];
  let cursor: Point = from || remaining[0];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((candidate, index) => {
      const distance = kmBetween(cursor, candidate);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    cursor = next;
  }

  return [...ordered, ...unlocated];
};

/**
 * Which day each area should own.
 *
 * Stability first: an area stays on the day it already mostly occupies, so a
 * plan that is already sensible is not reshuffled for the sake of it. Only the
 * areas left over are handed the days nobody claimed, biggest area to the
 * emptiest day.
 */
const assignAreasToDays = (
  areas: Array<{ id: string; items: ItineraryItem[] }>,
  dates: string[],
  anchoredByDate: Map<string, ItineraryItem[]>,
): Map<string, string> => {
  const chosen = new Map<string, string>();
  const taken = new Set<string>();

  const byCurrentDay = [...areas].sort((left, right) => right.items.length - left.items.length);

  byCurrentDay.forEach(area => {
    const counts = new Map<string, number>();
    area.items.forEach(item => {
      if (item.date) counts.set(item.date, (counts.get(item.date) || 0) + 1);
    });
    const preferred = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
    if (preferred && !taken.has(preferred)) {
      chosen.set(area.id, preferred);
      taken.add(preferred);
    }
  });

  /*
    A day already carrying a flight has less of itself to give, so the areas
    that still need a home are offered the quietest days first.
  */
  const free = dates
    .filter(date => !taken.has(date))
    .sort((left, right) =>
      (anchoredByDate.get(left)?.length || 0) - (anchoredByDate.get(right)?.length || 0));

  byCurrentDay
    .filter(area => !chosen.has(area.id))
    .forEach(area => {
      const date = free.shift();
      if (date) { chosen.set(area.id, date); taken.add(date); }
    });

  /*
    More areas than days, which is the normal case on a short trip.

    A test caught this dropping places entirely: four areas, three days, and
    the fourth area simply had no day and vanished from the plan. An algorithm
    that loses a place the traveller chose is worse than one that routes badly.

    So the areas left over join the day whose places they are nearest to —
    which is the same answer a person gives when a trip has more
    neighbourhoods than mornings.
  */
  const centres = new Map<string, Point>();
  chosen.forEach((date, areaId) => {
    const area = areas.find(entry => entry.id === areaId);
    const points = (area?.items || []).filter(located);
    if (points.length > 0) centres.set(date, centreOf(points));
  });

  areas
    .filter(area => !chosen.has(area.id))
    .forEach(area => {
      const points = area.items.filter(located);
      if (points.length === 0) return;
      const home = centreOf(points);
      let bestDate: string | undefined;
      let bestDistance = Infinity;
      centres.forEach((centre, date) => {
        const distance = kmBetween(home, centre);
        if (distance < bestDistance) { bestDistance = distance; bestDate = date; }
      });
      if (bestDate) chosen.set(area.id, bestDate);
      else if (dates.length > 0) chosen.set(area.id, dates[0]);
    });

  return chosen;
};

/**
 * @param dayStart when the traveller leaves, as `HH:MM`.
 */
export const optimiseTripRoute = (
  items: ItineraryItem[],
  options: { country?: string; dayStart?: string } = {},
): RoutePlan => {
  const dates = Array.from(new Set(items.map(item => item.date).filter(Boolean))).sort();
  const ground = new Set(stopsOnTheGround(items).map(item => item.id));

  const anchoredByDate = new Map<string, ItineraryItem[]>();
  items.filter(isAnchored).forEach(item => {
    if (!item.date) return;
    anchoredByDate.set(item.date, [...(anchoredByDate.get(item.date) || []), item]);
  });

  const movable = items.filter(item => !isAnchored(item) && located(item) && ground.has(item.id));
  const unplaced = items
    .filter(item => !isAnchored(item) && !located(item))
    .map(item => ({ item, reason: '沒有地圖位置，無法排進動線' }));

  const { clusters } = clusterSavedPlaces(
    movable.map(item => ({
      id: item.id,
      placeName: item.location || item.title || '',
      latitude: item.latitude,
      longitude: item.longitude,
      formattedAddress: item.address,
    })),
    undefined,
    options.country,
  );

  const byId = new Map(items.map(item => [item.id, item]));
  const areas = clusters.map(cluster => ({
    id: cluster.id,
    items: cluster.places.map(place => byId.get(place.id)).filter(Boolean) as ItineraryItem[],
  }));

  const areaDay = assignAreasToDays(areas, dates, anchoredByDate);

  const plannedByDate = new Map<string, ItineraryItem[]>();
  dates.forEach(date => plannedByDate.set(date, []));
  areas.forEach(area => {
    const date = areaDay.get(area.id);
    if (!date) return;
    plannedByDate.set(date, [...(plannedByDate.get(date) || []), ...area.items]);
  });

  const startMinutes = timeToMinutes(options.dayStart || '10:00') ?? 600;

  const days: RoutePlanDay[] = dates.map(date => {
    const anchored = (anchoredByDate.get(date) || []).filter(item => ground.has(item.id));
    const accommodation = anchored.find(item => item.type === 'HOTEL' && located(item));
    const ordered = orderByProximity(
      plannedByDate.get(date) || [],
      accommodation && located(accommodation) ? accommodation : undefined,
    );

    /*
      Laid out from the day's start, back to back. Each item's own length
      already includes the travel to it — 「每格預設 2 小時，含移動時間」 — so a
      gap here would be inventing one. Clashes with a flight are settled
      afterwards by `separateOverlaps`, which is the one place that knows how.
    */
    let cursor = startMinutes;
    const timed = ordered.map(item => {
      const next = { ...item, date, time: minutesToTime(cursor) };
      cursor += durationOf(item);
      return next;
    });

    return { date, items: timed, distanceKm: dayDistanceKm(timed) };
  });

  const beforeKm = dates.reduce((sum, date) => sum
    + dayDistanceKm(items.filter(item => item.date === date && !isAnchored(item) && ground.has(item.id))), 0);
  const afterKm = days.reduce((sum, day) => sum + day.distanceKm, 0);

  return { days, unplaced, beforeKm, afterKm };
};
