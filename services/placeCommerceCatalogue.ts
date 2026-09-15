/**
 * The price and ticket source behind /api/places/commerce.
 *
 * Extracted from the route so it can be tested directly. Two layers, and only the
 * first may ever produce a number:
 *
 *  1. A curated catalogue of human-verified prices. Every entry records who
 *     checked it and when. Nothing here is generated, inferred or model-written.
 *  2. Google Places categories, used purely to decide whether a place charges
 *     admission at all. This layer never produces a price.
 *
 * A place covered by neither layer returns null and the card shows nothing.
 */

/**
 * Where to read an official price, and how to recognise it.
 *
 * A human verifies the URL; the server reads the number from it at request time.
 * Nothing here contains a price — that is the point. If the page stops stating the
 * figure, the lookup yields nothing and the card says 查看最新票價.
 */
export interface CuratedPriceSource {
  /** A human-verified operator page that states the admission price in its HTML. */
  url: string;
  /** Shown to the user as the attribution, e.g. 官方網站. */
  sourceName: string;
  currency: string;
  /** e.g. 平日全票. The simplest general-admission reference, not a ticket matrix. */
  label?: string;
  /** Regex whose first capture group is the amount. */
  pattern: string;
  patternFlags?: string;
  /** Guards against markup noise parsing into an absurd figure. */
  maxPlausibleAmount: number;
}

/**
 * A booking link a human checked by opening it. There is no other way for a
 * provider button to exist — nothing is ever constructed from a place name.
 */
export interface CuratedBookingLink {
  provider: 'klook' | 'kkday' | string;
  label: string;
  url: string;
  /** `direct` promises a product page; `search` promises only a result list. */
  urlType: 'direct' | 'search';
}

export interface CuratedCommerceEntry {
  placeIds?: string[];
  /** Normalized name keys, for a place with no resolved Google identity yet. */
  nameKeys?: string[];
  admissionRequired: boolean;
  /** Declares where the live price lives. Absent = this place shows no number. */
  priceSource?: CuratedPriceSource;
  officialUrl?: string;
  /** Verified provider links. Absent = no provider buttons for this place. */
  bookingLinks?: CuratedBookingLink[];
  notes?: string[];
}

/**
 * A price older than this is no longer presented as current. Live-read prices are
 * dated at fetch time so they are always fresh; this bounds anything cached.
 */
export const MAX_PRICE_AGE_DAYS = 180;

/**
 * MAINTENANCE RULE — read before editing.
 *
 * An entry may only be added or changed by a human who has just looked at the
 * operator's own page. `checkedAt` must be updated in the same edit, and `source`
 * must say where the figure came from. A price nobody can point at does not
 * belong in this file; leaving it out simply shows 查看最新票價.
 */
export const PLACE_COMMERCE_CATALOGUE: CuratedCommerceEntry[] = [
  {
    nameKeys: ['spalandcentumcity', 'spaland', '신세계스파랜드', '스파랜드'],
    admissionRequired: true,
    notes: ['未滿 19 歲不可入場', '建議預留 3 小時以上'],
    // priceSource is intentionally absent.
    //
    // No verifiable official price page could be found: shinsegae.com's Centum
    // City page renders its content with JavaScript and states no admission price
    // in its HTML, and spaland.co.kr — the obvious-looking domain — is a squatted
    // gambling site, not the operator. Guessing either would have put a number on
    // the card that nobody could stand behind.
    //
    // To light this up, add a priceSource whose `url` is an operator page that
    // states the adult weekday admission in server-rendered HTML, and a `pattern`
    // that captures it. Until then this entry still earns the card its 門票 / 預約
    // section, its booking links and 查看最新票價 — all of which are true.
  },
];

/**
 * Place categories that reliably charge admission. Deliberately tight: broad
 * buckets like tourist_attraction or point_of_interest cover free beaches and
 * public squares too, and a wrong "needs a ticket" is worse than staying quiet.
 */
export const TICKETED_PLACE_TYPES = new Set([
  'amusement_park', 'aquarium', 'art_gallery', 'museum', 'zoo',
  'spa', 'water_park', 'planetarium', 'observation_deck', 'ski_resort',
  'cultural_landmark', 'historical_place', 'performing_arts_theater',
]);

/** Categories that are free to enter; seeing one of these settles the question. */
export const FREE_PLACE_TYPES = new Set([
  'beach', 'park', 'natural_feature', 'hiking_area', 'market',
  'shopping_mall', 'plaza', 'neighborhood', 'locality', 'restaurant', 'cafe',
]);

export const commerceNameKey = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/[\s\-_.,'()（）·・]/g, '');

/**
 * Whether a verified price is still recent enough to show as a reference.
 * An unparseable or future date fails closed: unknown freshness is not freshness.
 */
export const isPriceFresh = (checkedAt: string, now: Date = new Date()): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt)) return false;
  const checked = Date.parse(`${checkedAt}T00:00:00Z`);
  if (!Number.isFinite(checked)) return false;
  const ageDays = (now.getTime() - checked) / 86_400_000;
  // A small negative age absorbs timezone skew; a wildly future date is bad data.
  if (ageDays < -2) return false;
  return ageDays <= MAX_PRICE_AGE_DAYS;
};

/**
 * Finds the curated entry for a place.
 *
 * A resolved placeId matches exactly. A name matches only on exact equality after
 * normalization — never as a substring. Substring matching is how a key like 「市場」
 * would attach its price to 札嘎其市場, 國際市場 and every other market in the world,
 * which is precisely the loose name matching a price must never rely on. The cost
 * is that a catalogue entry has to list each spelling it covers, which is the
 * right way round: being unlisted shows 查看最新票價, being wrong shows a false price.
 */
export const findCuratedCommerce = (
  placeId: string | undefined,
  placeName: string | undefined,
  catalogue: CuratedCommerceEntry[] = PLACE_COMMERCE_CATALOGUE,
): CuratedCommerceEntry | undefined => {
  const id = placeId?.trim();
  if (id) {
    const byId = catalogue.find(entry => entry.placeIds?.includes(id));
    if (byId) return byId;
  }
  const key = commerceNameKey(placeName || '');
  if (key.length < 3) return undefined;
  return catalogue.find(entry => entry.nameKeys?.some(candidate => candidate === key));
};

/** What the category layer concluded. 'unknown' means we say nothing at all. */
export type PlaceAdmissionVerdict = 'ticketed' | 'free' | 'unknown';

export const classifyPlaceTypes = (types: readonly string[] | undefined): PlaceAdmissionVerdict => {
  if (!Array.isArray(types) || types.length === 0) return 'unknown';
  // Free wins: a beach inside a paid park is still a beach to the user.
  if (types.some(type => FREE_PLACE_TYPES.has(type))) return 'free';
  if (types.some(type => TICKETED_PLACE_TYPES.has(type))) return 'ticketed';
  return 'unknown';
};

/*
 * There is deliberately no function here that builds a provider URL from a place
 * name.
 *
 * An earlier version generated Klook and KKday search links by interpolating the
 * name into a URL pattern. Those were guesses, and they could not be checked:
 * probing klook.com and kkday.com from a server returns 403 for a correct path
 * and for a deliberately invented one alike, so there was no way to tell a real
 * search URL from a fabricated one. A button that looks authoritative and may go
 * nowhere is worse than no button, so provider links now come only from
 * `CuratedBookingLink` entries a human opened and confirmed.
 */

/**
 * Builds the commerce payload for a curated place.
 *
 * The price, if any, is handed in by the live lookup — this function has no way to
 * produce one on its own, which is what guarantees no hardcoded figure can reach a
 * card. A price that arrives stale is dropped rather than downgraded: the place
 * stays ticketed, so the card keeps its links and says 查看最新票價.
 */
export const buildCuratedCommerce = (
  entry: CuratedCommerceEntry,
  _placeName: string,
  livePrice?: { amount: number; currency: string; label?: string; sourceName: string; sourceUrl: string; checkedAt: string },
  now: Date = new Date(),
) => {
  const usablePrice = livePrice && isPriceFresh(livePrice.checkedAt, now) ? livePrice : undefined;
  return {
    admissionRequired: entry.admissionRequired,
    ...(usablePrice ? { officialPrice: usablePrice } : {}),
    // Declared links only. Each is validated before it reaches the client.
    bookingOptions: [
      ...(entry.officialUrl
        ? [{ provider: 'official', label: '官方網站', url: entry.officialUrl, urlType: 'direct' as const }]
        : entry.priceSource?.url
          ? [{ provider: 'official', label: '官方網站', url: entry.priceSource.url, urlType: 'direct' as const }]
          : []),
      ...(entry.bookingLinks || []).map(link => ({
        provider: link.provider, label: link.label, url: link.url, urlType: link.urlType,
      })),
    ],
    ...(entry.notes?.length ? { notes: entry.notes } : {}),
    ...(livePrice && !usablePrice ? { priceStale: true } : {}),
  };
};
