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
 *
 * The sentences are resolved at call time rather than at module load, because
 * these functions are called while the leg renders and the reader can change
 * language after the module is first imported.
 */
import i18n from '../i18n/config';

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
  sameSpot
    ? i18n.t('transport.sameSpotSummary')
    : i18n.t('transport.noRouteSummary', { mode: modeLabel });

/**
 * A rough transit time, for a journey no route service will answer.
 *
 * 「如果不能顯示路線 但可不可以給大眾運輸大概的時間」. Japan's train times are not in
 * the Routes API and Korea's are blocked by law, so on two of the three
 * countries this app is used in the transit chip could only ever say 查不到 —
 * and 查不到 is the one answer that cannot be planned around. A number with its
 * uncertainty attached is worth more than a blank.
 *
 * The arithmetic is `transitMinutesBetween`, which has been sizing the gaps
 * between stops for the planner all along: a fixed overhead for getting to and
 * from the platform, plus a rate per kilometre of straight-line distance. It is
 * the same estimate the app already schedules by — it was simply never shown.
 *
 * Always marked 估算. It does not know about a river, a transfer, or the last
 * train, and a number presented as a route would be a lie about what was asked.
 */
export const roughTransitSummary = (minutes: number): string =>
  i18n.t('transport.roughTransitSummary', { minutes });

export const roughTransitDetail = (minutes: number): string =>
  i18n.t('transport.roughTransitDetail', { minutes });

/** The fuller sentence inside the sheet, where there is room to say what to try. */
export const noRouteDetail = (modeLabel: string, sameSpot: boolean): string =>
  sameSpot
    ? i18n.t('transport.sameSpotDetail')
    : i18n.t('transport.noRouteDetail', { mode: modeLabel });
