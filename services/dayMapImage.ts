/**
 * The day's stops as one map picture.
 *
 * 「行程的地圖模式」, built without a browser-side Maps key: the image is composed
 * by Google's Static Maps API and proxied through our own server, so the key
 * stays where it already is. The cost is that the map cannot be panned or
 * zoomed, which the Founder accepted in order to see it working tonight.
 *
 * This module only decides *what* to ask for. It never sees the key and never
 * makes a request — the server does both, which is the whole point.
 */

export interface MapStop {
  id: string;
  latitude: number;
  longitude: number;
}

/**
 * Stops that can actually be drawn, in order, numbered as the traveller sees.
 *
 * Numbering follows the day, not the drawable subset: a stop with no
 * coordinates still takes its number in the list, so pin 3 on the map is the
 * third thing on the plan even when the second could not be placed. Renumbering
 * around a gap would quietly disagree with the list beside it.
 */
export interface NumberedStop extends MapStop {
  /** 1-based position in the day, including stops that cannot be mapped. */
  number: number;
  /**
   * Where you sleep, drawn as a house rather than as a numbered stop.
   *
   * 「住宿點在地圖上可以是放一個小房子嗎」 — and it is the right question: a hotel
   * is not the third thing you do, it is where the day starts and ends. A
   * numbered pin says 「go here, third」 about the building you woke up in.
   */
  lodging?: boolean;
}

/**
 * How far from the rest of a day a point can be and still be part of it.
 *
 * 「最後一天會跨國！且也只能跨國」 — the last day ends with 航班抵達 at Taoyuan, so
 * the day's picture was a single line across the East China Sea and its 「最遠
 * 兩點」 was two thousand kilometres. The four real stops in Tokyo were a dot.
 *
 * A day's map is about moving between places on the ground. The far end of a
 * flight is not that, and it is still in the list underneath where it belongs.
 *
 * Expressed as a distance rather than as 「a flight」 on purpose: the rule is
 * 「this is not part of today's ground movement」, which is true of a landing
 * abroad however the item happens to be typed. A hundred kilometres is past
 * any day trip this app plans and short of every international leg.
 */
export const FAR_FROM_THE_DAY_KM = 100;

const EARTH_RADIUS_KM = 6371;

const kmBetween = (
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(right.latitude - left.latitude);
  const dLon = toRad(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(left.latitude)) * Math.cos(toRad(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * A day's located items, without the ones that are not on it in any useful
 * sense. See `FAR_FROM_THE_DAY_KM`.
 *
 * Measured against the median rather than the mean, so one point on another
 * continent cannot drag the centre out towards itself and take a real stop
 * with it.
 */
export const stopsOnTheGround = <T extends { latitude?: number; longitude?: number }>(
  items: T[],
): T[] => {
  const located = items.filter(item =>
    typeof item.latitude === 'number' && typeof item.longitude === 'number');
  if (located.length < 3) return items;

  const median = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const centre = {
    latitude: median(located.map(item => item.latitude as number)),
    longitude: median(located.map(item => item.longitude as number)),
  };

  return items.filter(item => {
    if (typeof item.latitude !== 'number' || typeof item.longitude !== 'number') return true;
    return kmBetween(centre, { latitude: item.latitude, longitude: item.longitude })
      <= FAR_FROM_THE_DAY_KM;
  });
};

export const mappableStops = <T extends { id: string; latitude?: number; longitude?: number }>(
  items: T[],
): Array<NumberedStop & { item: T }> =>
  items.flatMap((item, index) =>
    typeof item.latitude === 'number' && typeof item.longitude === 'number'
      ? [{
          id: item.id,
          latitude: item.latitude,
          longitude: item.longitude,
          number: index + 1,
          item,
        }]
      : [],
  );

/** The app's purple, as hex the Static Maps API accepts. */
const PIN = '0x5b3df5';

/**
 * The house, for where you sleep.
 *
 * Static Maps has no 「house」 of its own, so this is a tiny SVG served from
 * our own origin — the API fetches `icon` over the public internet, which is
 * why it has to be an absolute URL and why it is ours rather than a hotlink to
 * somebody else's sprite sheet.
 */
/**
 * The house, in a colour that is not every other pin's.
 *
 * 「朋友家換個顏色！讓他明顯一點！」 — it was drawn in this project's violet, which
 * is also the colour of every numbered stop and of the roads' labels around
 * it, so the one marker that is *not* a stop disappeared into the ones that
 * are. Amber reads at a glance and is not used by anything else on the map.
 */
export const LODGING_ICON_PATH = '/icons/lodging-pin.png';

/**
 * Static Maps labels are a single character — one of A–Z or 0–9.
 *
 * So stops past the ninth cannot carry their number, and are drawn as a plain
 * pin rather than as a wrong number. The list beside the map still numbers
 * every one of them; this is a limit of the picture, not of the day.
 */
export const pinLabel = (number: number): string | undefined =>
  number >= 1 && number <= 9 ? String(number) : undefined;

export interface DayMapRequest {
  stops: NumberedStop[];
  /**
   * Road geometry between consecutive stops, already encoded by the Routes
   * API. Absent legs fall back to a straight line between the two pins, which
   * is honest about being a connector rather than a route.
   */
  encodedPaths?: string[];
  width: number;
  height: number;
  /**
   * Whether to draw a line through the pins.
   *
   * 「收藏區可以每一區也都給一張靜態地圖嗎」 — a day is walked in an order and the
   * line is that order. A collection is not: joining 十三個收藏 with a line
   * would draw a route nobody plans to take, in the order they happened to be
   * saved. Defaults to true, which is every existing caller.
   */
  connect?: boolean;
  /**
   * This app's public origin, for the one marker that is an image.
   *
   * Static Maps fetches a custom `icon` itself, over the internet, so a
   * relative path is not something it can resolve. Absent, a lodging stop
   * falls back to an ordinary pin rather than requesting a URL that cannot
   * work.
   */
  origin?: string;
}

/**
 * The query the server will sign with its key.
 *
 * No centre and no zoom: with markers and paths present, Static Maps frames
 * them itself, and anything we computed would be a worse version of that.
 */
export const dayMapQuery = ({
  stops, encodedPaths = [], width, height, connect = true, origin,
}: DayMapRequest): URLSearchParams => {
  const query = new URLSearchParams();
  query.set('size', `${Math.round(width)}x${Math.round(height)}`);
  // Retina. The map is read on a phone, where the unscaled version is mush.
  query.set('scale', '2');
  query.set('language', 'zh-TW');

  for (const stop of stops) {
    if (stop.lodging && origin) {
      // A house, and no number: see `lodging`.
      query.append('markers', `icon:${origin}${LODGING_ICON_PATH}|${stop.latitude},${stop.longitude}`);
      continue;
    }
    const label = pinLabel(stop.number);
    query.append(
      'markers',
      `color:${PIN}|${label ? `label:${label}|` : ''}${stop.latitude},${stop.longitude}`,
    );
  }

  const paths = connect ? encodedPaths.filter(Boolean) : [];
  /*
    The lodging is drawn, not walked.

    「住宿點的圖釘呢」 — the house marks where the day starts and ends, and it is
    on the map so the stops can be read against it. Joining it into the
    connector would add a leg nobody planned and that no route was fetched
    for: the line is the order the day is walked in, and the house is not a
    stop in that order.
  */
  const walked = stops.filter(stop => !stop.lodging);
  if (paths.length > 0) {
    for (const path of paths) query.append('path', `color:${PIN}c0|weight:4|enc:${path}`);
  } else if (connect && walked.length > 1) {
    query.append(
      'path',
      `color:${PIN}c0|weight:4|${walked.map(stop => `${stop.latitude},${stop.longitude}`).join('|')}`,
    );
  }

  return query;
};

/** Our own endpoint, which is all the browser ever learns about. */
export const dayMapSrc = (request: DayMapRequest): string =>
  `/api/maps/day?${dayMapQuery(request).toString()}`;
