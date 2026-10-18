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
  `⏱ 粗估大約 ${minutes} 分鐘（含進出站）`;

export const roughTransitDetail = (minutes: number): string =>
  `這段直線距離換算下來大約 ${minutes} 分鐘，含進出站與等車的時間。這是估算、不是班次查詢——沒有算進轉乘、末班車或實際路線，排行程抓個大概可以，出門前請用 Google 地圖 App 或當地的轉乘 App 再確認。`;

/** The fuller sentence inside the sheet, where there is room to say what to try. */
export const noRouteDetail = (modeLabel: string, sameSpot: boolean): string =>
  sameSpot
    ? '這兩個行程在同一個地點，中間沒有需要安排的交通。'
    : `查不到這兩個地點之間的${modeLabel}路線，換上面其他方式可能查得到。`;
