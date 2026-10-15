/**
 * A newly added place that is far from everything else on its day.
 *
 * 「動線還是蠻不合理 跨太多區了」. Measured on his three days: 淺草 was 1.2 km
 * across, 港區 3.3 km, and 新宿 7.1 km — because 豪德寺, in Setagaya, had been
 * put on a Shinjuku day.
 *
 * `additionsToTheirArea` cannot help there: 豪德寺 is the only place in its
 * ward, and 「keep one area on one day」 says nothing about an area of one. The
 * rule this needs is different — 「a stop far from its day belongs on a day it
 * is nearer to」 — and it is about distance rather than about areas.
 *
 * Deliberately reluctant. It moves only when the day it is leaving is genuinely
 * far and the day it is joining is clearly nearer, so a plan is tidied and
 * never churned. A place with nowhere better to be stays where the model put
 * it, which on a trip of three scattered days is the honest outcome.
 */
import { ItineraryItem } from '../types';
import { stopsOnTheGround } from './dayMapImage';

/** Far enough from its own day to be worth questioning. */
export const FAR_FROM_ITS_DAY_KM = 4;
/** How much nearer another day has to be before anything moves. */
export const CLEARLY_NEARER_KM = 2;

const EARTH_RADIUS_KM = 6371;

interface Point { latitude: number; longitude: number }

const kmBetween = (left: Point, right: Point): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(right.latitude - left.latitude);
  const dLon = toRad(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(left.latitude)) * Math.cos(toRad(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Flights, check-ins and anything pinned.
 *
 * Left out of a day's centre rather than only left unmoved: an airport sixty
 * kilometres out would drag the centre towards itself and make every real stop
 * on that day look like the outlier.
 */
const isFixed = (item: ItineraryItem): boolean =>
  Boolean(item.derivedFromFlightAnchorId) || item.type === 'FLIGHT' || Boolean(item.isPinned);

const located = (item: ItineraryItem): item is ItineraryItem & Point =>
  typeof item.latitude === 'number' && typeof item.longitude === 'number';

/** The middle of a set of points, by median so one stray cannot drag it. */
const centreOf = (points: Point[]): Point | undefined => {
  if (points.length === 0) return undefined;
  const median = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    latitude: median(points.map(point => point.latitude)),
    longitude: median(points.map(point => point.longitude)),
  };
};

/**
 * @param addedIds the items this adjustment created. Nothing else is moved —
 *   an arrangement the traveller made by hand is theirs.
 */
export const outlierToNearerDay = (
  items: ItineraryItem[],
  addedIds: Set<string>,
): { items: ItineraryItem[]; movedCount: number } => {
  if (addedIds.size === 0) return { items, movedCount: 0 };

  const ground = new Set(stopsOnTheGround(items).map(item => item.id));
  const anchors = items.filter(item =>
    located(item) && !isFixed(item) && item.date && ground.has(item.id));

  const byDate = new Map<string, Array<ItineraryItem & Point>>();
  anchors.forEach(item => {
    byDate.set(item.date, [...(byDate.get(item.date) || []), item as ItineraryItem & Point]);
  });

  const moved = new Map<string, string>();

  items.forEach(item => {
    if (!addedIds.has(item.id) || !located(item) || isFixed(item) || !item.date) return;
    if (!ground.has(item.id)) return;

    /*
      Its own day, measured without it: a lone stop would otherwise be its own
      centre and could never be far from anything.
    */
    const ownDay = (byDate.get(item.date) || []).filter(other => other.id !== item.id);
    const ownCentre = centreOf(ownDay);
    if (!ownCentre) return;
    const fromOwn = kmBetween(item, ownCentre);
    if (fromOwn <= FAR_FROM_ITS_DAY_KM) return;

    let bestDate: string | undefined;
    let bestDistance = Infinity;
    byDate.forEach((dayItems, date) => {
      if (date === item.date) return;
      const centre = centreOf(dayItems.filter(other => other.id !== item.id));
      if (!centre) return;
      const distance = kmBetween(item, centre);
      if (distance < bestDistance) { bestDistance = distance; bestDate = date; }
    });

    if (bestDate && fromOwn - bestDistance >= CLEARLY_NEARER_KM) moved.set(item.id, bestDate);
  });

  if (moved.size === 0) return { items, movedCount: 0 };
  return {
    items: items.map(item => (moved.has(item.id) ? { ...item, date: moved.get(item.id) as string } : item)),
    movedCount: moved.size,
  };
};
