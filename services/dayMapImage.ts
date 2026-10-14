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
}

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
}

/**
 * The query the server will sign with its key.
 *
 * No centre and no zoom: with markers and paths present, Static Maps frames
 * them itself, and anything we computed would be a worse version of that.
 */
export const dayMapQuery = ({ stops, encodedPaths = [], width, height }: DayMapRequest): URLSearchParams => {
  const query = new URLSearchParams();
  query.set('size', `${Math.round(width)}x${Math.round(height)}`);
  // Retina. The map is read on a phone, where the unscaled version is mush.
  query.set('scale', '2');
  query.set('language', 'zh-TW');

  for (const stop of stops) {
    const label = pinLabel(stop.number);
    query.append(
      'markers',
      `color:${PIN}|${label ? `label:${label}|` : ''}${stop.latitude},${stop.longitude}`,
    );
  }

  const paths = encodedPaths.filter(Boolean);
  if (paths.length > 0) {
    for (const path of paths) query.append('path', `color:${PIN}c0|weight:4|enc:${path}`);
  } else if (stops.length > 1) {
    query.append(
      'path',
      `color:${PIN}c0|weight:4|${stops.map(stop => `${stop.latitude},${stop.longitude}`).join('|')}`,
    );
  }

  return query;
};

/** Our own endpoint, which is all the browser ever learns about. */
export const dayMapSrc = (request: DayMapRequest): string =>
  `/api/maps/day?${dayMapQuery(request).toString()}`;
