/**
 * What to say when a journey has no route to show.
 *
 * 「要去調整說法」. The line read 「這個地區查不到大眾運輸路線」 under two cards that
 * were both Taiwan Taoyuan International Airport — one of the best-connected
 * transit hubs in the country. The sentence made a claim about the *region*
 * when the only thing the app had learned was about *this pair of points*, and
 * it blamed the place for our own lookup.
 *
 * Everything below says what is actually known and what to do next. The
 * traveller has three mode chips immediately above this text, and a line that
 * ends in a dead claim is a line that does not mention them.
 */

/** Two points this close are the same spot; a route between them is noise. */
const SAME_SPOT_METRES = 150;

export interface Point {
  latitude: number;
  longitude: number;
}

/** Straight-line metres, which is all that is needed to tell "here" from "not here". */
export const metresBetween = (from: Point, to: Point): number => {
  const EARTH_RADIUS_M = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

export const isSameSpot = (from: Point, to: Point): boolean =>
  metresBetween(from, to) <= SAME_SPOT_METRES;

/**
 * The one line on the plan.
 *
 * Two different situations the old wording collapsed into one: there is
 * nowhere to go, and we could not find the way. Only the second is a failure,
 * and only the second is worth another tap.
 */
export const noRouteSummary = (modeLabel: string, sameSpot: boolean): string =>
  sameSpot ? '就在同一個地點，不用移動' : `查不到這段的${modeLabel}路線`;

/** The fuller sentence inside the sheet, where there is room to say what to try. */
export const noRouteDetail = (modeLabel: string, sameSpot: boolean): string =>
  sameSpot
    ? '這兩個行程在同一個地點，中間沒有需要安排的交通。'
    : `查不到這兩個地點之間的${modeLabel}路線，換上面其他方式可能查得到。`;
