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
