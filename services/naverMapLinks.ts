/**
 * Opening a Korean place in NAVER Map.
 *
 * Every detail here was confirmed on a real iPhone with the app installed,
 * because the one thing this link cannot do is fail loudly.
 *
 *   A1  https://app.map.naver.com/launchApp/place?lat=&lng=&name=&appname=
 *       → opened NAVER Map, pin on 성수동, card titled with the `name` we
 *         sent, address resolved, From / To buttons underneath.
 *
 *   A4  the same link with `latitude` / `longitude` instead of `lat` / `lng`
 *       → opened NAVER Map anyway, sat on the traveller's own location in
 *         Taiwan, 「Out of service range」, no pin, no error.
 *
 * A4 is the whole reason for the guard below. A wrong parameter does not
 * produce a broken link, it produces a working link to the wrong place — and
 * somebody standing in Seoul looking for a cafe has no way to tell that the
 * app opened on the wrong thing because Trippie sent a field name nobody
 * reads. So a link is built only when there is a real point to send, and
 * otherwise the caller falls back to what it did before.
 *
 * HTTPS, not `navermaps://`, although both were verified to work. The scheme
 * fails silently when the app is absent; this host declares the app in its
 * apple-app-site-association, so iOS opens the app when it is installed and
 * NAVER's own page offers the App Store when it is not. The 「did it open?」
 * guess stays on NAVER's side, where it is their page and their problem.
 *
 *   https://app.map.naver.com/.well-known/apple-app-site-association
 *   → appIDs ["6379BPE45W.com.nhncorp.NaverMap"], components /launchApp/*
 *
 * Worth knowing before testing this outside Korea: the app says 「This app is
 * available in Korea only」 and will show the map and the pin but refuse to
 * compute a route. That is NAVER's restriction, not a broken link.
 */

/** The verified Universal Link base. Not map.naver.com, which declares no app. */
const LAUNCH_BASE = 'https://app.map.naver.com/launchApp';

/**
 * Who is asking. NAVER's own pages pass their host here; ours passes the app
 * id the project already uses, so a link is traceable to Trippie.
 */
const APP_NAME = 'com.trippie.app';

export interface NaverPlace {
  /** Shown as the title on the card NAVER opens. */
  placeName: string;
  coordinates?: { latitude: number; longitude: number };
}

const point = (place: NaverPlace): { latitude: number; longitude: number } | null => {
  const latitude = place.coordinates?.latitude;
  const longitude = place.coordinates?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude: latitude as number, longitude: longitude as number };
};

/**
 * The link, or nothing.
 *
 * `null` is a real answer and the caller must handle it: no coordinates means
 * no NAVER link, because the alternative is A4 — the app opens, lands
 * somewhere else, and says nothing. Google's link can search by name; this one
 * cannot, so it declines rather than guessing.
 */
export const naverPlaceUrl = (place: NaverPlace): string | null => {
  const here = point(place);
  if (!here) return null;

  const params = new URLSearchParams({
    lat: String(here.latitude),
    lng: String(here.longitude),
    // Verified as the label field: the card's title was the string we sent.
    name: place.placeName?.trim() || '目的地',
    appname: APP_NAME,
  });

  return `${LAUNCH_BASE}/place?${params.toString()}`;
};

/** Whether this place can be opened in NAVER Map at all. */
export const canOpenInNaver = (place: NaverPlace): boolean => naverPlaceUrl(place) !== null;

/**
 * A route, verified on a phone: 서울역 → 성수동 opened NAVER on that journey.
 *
 * The three targets are NAVER's own, and they are not interchangeable.
 * `/navigation` is turn-by-turn driving; walking and transit have to use
 * their own `/route/` actions or the traveller gets driving directions for a
 * walk across a park.
 *
 * This is the link Trippie's travellers actually press. The transport card
 * between two itinerary stops already knew it was in Korea — it has been
 * printing 「因法規限制，Google 地圖無法以『開車』查詢」 and telling people to go
 * to Naver themselves, because Google publishes no driving or walking routes
 * there at all. It knew the answer and had no way to send anybody.
 */

export type NaverRouteMode = 'transit' | 'drive' | 'walk';

const ROUTE_TARGET: Record<NaverRouteMode, string> = {
  transit: 'route/public',
  drive: 'route/car',
  walk: 'route/walk',
};

export interface RouteEnd {
  latitude?: number;
  longitude?: number;
  name?: string;
}

const ends = (end: RouteEnd): { latitude: number; longitude: number } | null => {
  if (!Number.isFinite(end.latitude) || !Number.isFinite(end.longitude)) return null;
  return { latitude: end.latitude as number, longitude: end.longitude as number };
};

/**
 * The route link, or nothing.
 *
 * Both ends are required. A route with one real end is the A4 failure with an
 * extra step: NAVER opens, shows something, and the traveller believes it.
 */
export const naverRouteUrl = (
  origin: RouteEnd,
  destination: RouteEnd,
  mode: NaverRouteMode,
): string | null => {
  const from = ends(origin);
  const to = ends(destination);
  if (!from || !to) return null;

  const params = new URLSearchParams({
    slat: String(from.latitude),
    slng: String(from.longitude),
    sname: origin.name?.trim() || '出發地',
    dlat: String(to.latitude),
    dlng: String(to.longitude),
    dname: destination.name?.trim() || '目的地',
    appname: APP_NAME,
  });

  return `${LAUNCH_BASE}/${ROUTE_TARGET[mode]}?${params.toString()}`;
};
