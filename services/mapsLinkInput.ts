/**
 * What the traveller pasted into 「手動新增地點」.
 *
 * 「我希望他可以即使輸入地址或是 google map 連結都可以帶入」. The box searched
 * whatever it was given as a shop name, so a pasted Google Maps link was sent
 * to autocomplete as the literal string `https://maps.app.goo.gl/…` and found
 * nothing — which is the most common way anybody actually shares a place.
 *
 * Everything here is reading, never fetching. A short link cannot be expanded
 * in the browser (the host does not allow it to be read cross-origin), so that
 * one case is named and handed to the server.
 */

export type MapsLinkInput =
  /** Plain words: a shop name or an address, searched as typed. */
  | { kind: 'text'; query: string }
  /** A maps link that names its place, optionally with where it sits. */
  | { kind: 'link'; query: string; latitude?: number; longitude?: number }
  /** A maps link with a position but no name. The position is the search bias. */
  | { kind: 'position'; latitude: number; longitude: number }
  /** `maps.app.goo.gl/…`, which only the server can follow. */
  | { kind: 'shortLink'; url: string };

const MAPS_HOSTS = /(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$|(^|\.)maps\.app\.goo\.gl$/i;
const SHORT_HOSTS = /(^|\.)goo\.gl$/i;

/** Hosts the server is allowed to follow. Not a general URL expander. */
export const isExpandableMapsLink = (raw: string): boolean => {
  try {
    const url = new URL(raw.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && SHORT_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
};

const numberPair = (a?: string, b?: string): { latitude: number; longitude: number } | undefined => {
  const latitude = Number(a);
  const longitude = Number(b);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : undefined;
};

/**
 * The place's own coordinates, preferred over the map's viewport.
 *
 * A `/place/` URL carries both: `!3d…!4d…` is where the pin is, and `@lat,lng`
 * is merely where the map was centred when the link was made. They are usually
 * the same and occasionally are not, and the pin is the one that was shared.
 */
const coordinatesIn = (raw: string) =>
  numberPair(...(raw.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/)?.slice(1, 3) as [string, string] ?? []))
  || numberPair(...(raw.match(/@(-?[\d.]+),(-?[\d.]+)/)?.slice(1, 3) as [string, string] ?? []));

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' ')).trim();
  } catch {
    return value.replace(/\+/g, ' ').trim();
  }
};

/*
  A coordinate pair pasted as the query — 「35.6595,139.7005」 — is a position,
  not a name. Searching for it as text finds nothing.
*/
const BARE_COORDINATES = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export const readMapsInput = (typed: string): MapsLinkInput => {
  const raw = (typed || '').trim();
  if (!raw) return { kind: 'text', query: '' };

  const bare = raw.match(BARE_COORDINATES);
  const barePosition = bare && numberPair(bare[1], bare[2]);
  if (barePosition) return { kind: 'position', ...barePosition };

  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    // Not a URL at all, which is the ordinary case: a name or an address.
    return { kind: 'text', query: raw };
  }

  if (!MAPS_HOSTS.test(url.hostname)) return { kind: 'text', query: raw };
  if (isExpandableMapsLink(raw)) return { kind: 'shortLink', url: raw };

  /*
    A query that is itself a coordinate pair is a position, not a name — and
    `?q=35.6,139.7` carries no `@` or `!3d`, so it has to be read out of the
    parameter or the whole URL falls through and gets searched as text.
  */
  const queried = [
    url.searchParams.get('q'),
    url.searchParams.get('query'),
    url.searchParams.get('destination'),
  ].map(value => decode(value || '')).find(value => BARE_COORDINATES.test(value));
  const queriedPosition = queried
    ? numberPair(...(queried.match(BARE_COORDINATES)!.slice(1, 3) as [string, string]))
    : undefined;

  const position = coordinatesIn(raw) || queriedPosition;

  /*
    The name, from wherever this particular flavour of link keeps it. Google
    has several — a shared pin, a search result and 「複製連結」 all differ — and
    a name that is itself a coordinate pair is not a name.
  */
  const fromPath = url.pathname.match(/\/place\/([^/@]+)/)?.[1];
  const named = [
    fromPath && decode(fromPath),
    decode(url.searchParams.get('q') || ''),
    decode(url.searchParams.get('query') || ''),
    decode(url.searchParams.get('destination') || ''),
  ].find(value => value && !BARE_COORDINATES.test(value) && !/^place_id:/i.test(value));

  if (named) return { kind: 'link', query: named, ...position };
  if (position) return { kind: 'position', ...position };

  // A maps link we cannot read anything out of — a bare `/maps` or a profile.
  return { kind: 'text', query: raw };
};
