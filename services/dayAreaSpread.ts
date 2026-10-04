import { ItineraryItem } from '../types';
import { TripAreas } from './tripAreas';
import { distanceKm, PlaceCluster } from './placeClusters';

/**
 * Whether a day stays in one part of the city.
 *
 * 「行程表需要以色塊來提示用戶，讓他們能一目瞭然的知道自己選的各項行程是否在同一個
 * 區塊」. The colours already say which area each stop is in; this says what that
 * adds up to. A day with three colours in it is a day that crosses the city
 * three times, and that is a fact about the day rather than about any one card
 * on it.
 *
 * Counted from the areas the trip already computed, not re-derived here: a
 * second opinion about which places are near each other is how one screen comes
 * to disagree with the colour on another.
 */

export interface DayAreaSpread {
  /** The areas this day touches, in the order the day visits them. */
  areas: PlaceCluster[];
  /** Stops with no location, which belong to no area and are not counted. */
  unplacedCount: number;
  /** The furthest two stops on the day, in km, where both are located. */
  longestHopKm?: number;
}

/**
 * What a day's stops add up to, geographically.
 *
 * Flights and check-ins are left in: they are where the day starts and ends,
 * and a day whose only two areas are 「the airport」 and 「the hotel」 is not a
 * day that needs warning about.
 */
export const dayAreaSpread = (
  items: ItineraryItem[],
  areas: TripAreas,
): DayAreaSpread => {
  const seen = new Map<string, PlaceCluster>();
  let unplacedCount = 0;

  items.forEach(item => {
    const area = areas.areaOfItem(item.id);
    if (!area) { unplacedCount += 1; return; }
    if (!seen.has(area.id)) seen.set(area.id, area);
  });

  const located = items.filter(item =>
    Number.isFinite(item.latitude) && Number.isFinite(item.longitude));

  let longestHopKm: number | undefined;
  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const span = distanceKm(
        { latitude: located[i].latitude as number, longitude: located[i].longitude as number },
        { latitude: located[j].latitude as number, longitude: located[j].longitude as number },
      );
      if (longestHopKm === undefined || span > longestHopKm) longestHopKm = span;
    }
  }

  return {
    areas: Array.from(seen.values()),
    unplacedCount,
    longestHopKm: longestHopKm === undefined ? undefined : Math.round(longestHopKm * 10) / 10,
  };
};

/**
 * How far apart a day may be spread before it is worth saying something.
 *
 * Two areas is normal — a morning somewhere and dinner somewhere else is a
 * day, not a mistake. Three is when a day starts being spent on the subway.
 */
export const CROWDED_AREA_COUNT = 3;

export const daySpansTooManyAreas = (spread: DayAreaSpread): boolean =>
  spread.areas.length >= CROWDED_AREA_COUNT;
