import { ItineraryItem } from '../types';
import { stopsOnTheGround } from './dayMapImage';
import { TripAreas } from './tripAreas';
import { distanceKm, districtOf, PlaceCluster } from './placeClusters';

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
  /**
   * Where most of this day actually is.
   *
   * 「這邊可以提示說：今日行程大多都集中在」 — and the line was already naming an
   * area, which on his Setagaya-plus-Shibuya day read 「今天在 Minato City」.
   * `areas` are the trip's clusters, and a cluster is labelled by the majority
   * ward across the whole trip. That is the right label for the cluster and
   * the wrong answer to 「where is today」.
   *
   * So this is counted from this day's own stops, by the same `districtOf`
   * that names everything else. Undefined when the day's stops do not agree
   * enough to call it 「mostly」 anywhere — see `MOSTLY`.
   */
  mainArea?: string;
}

/**
 * How much of a day has to be in one ward before it is 「mostly」 there.
 *
 * More than half, strictly. A test caught exactly half passing: a day of one
 * stop in 渋谷 and one in 台東 was declared 「mostly 台東区」, chosen by sorting
 * the tie alphabetically. A day split down the middle is split, and naming a
 * winner there is picking a side rather than reporting one.
 */
const MOSTLY = 0.5;

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
  /** The trip's country, so an address is read with its own conventions. */
  country?: string,
): DayAreaSpread => {
  const seen = new Map<string, PlaceCluster>();
  let unplacedCount = 0;

  items.forEach(item => {
    const area = areas.areaOfItem(item.id);
    if (!area) { unplacedCount += 1; return; }
    if (!seen.has(area.id)) seen.set(area.id, area);
  });

  /*
    「最後一天會跨國！」 — the return flight's landing is on the day, so 「最遠兩點」
    was reading two thousand kilometres and saying nothing about the four real
    stops in Tokyo. See `stopsOnTheGround`.
  */
  const located = stopsOnTheGround(items).filter(item =>
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

  /*
    Where most of today is, from today's own stops. See `mainArea`.
  */
  const wards = new Map<string, number>();
  let counted = 0;
  located.forEach(item => {
    const ward = districtOf(item.address, country);
    if (!ward) return;
    counted += 1;
    wards.set(ward, (wards.get(ward) || 0) + 1);
  });
  const leading = Array.from(wards.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  const mainArea = leading && counted > 0 && leading[1] / counted > MOSTLY
    ? leading[0]
    : undefined;

  return {
    areas: Array.from(seen.values()),
    unplacedCount,
    longestHopKm: longestHopKm === undefined ? undefined : Math.round(longestHopKm * 10) / 10,
    mainArea,
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
