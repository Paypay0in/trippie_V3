/**
 * What we are actually buying from Google, counted at the moment we buy it.
 *
 * Every cost figure given to the Founder so far multiplied a real unit price by
 * an invented call count — 「each traveller searches 20 times a month」 was my
 * assumption, never a measurement, and the spread between $3,000 and $12,000 a
 * month at 10,000 testers lives entirely inside that invention. The code could
 * be read for *where* a call happens and never for *how often*.
 *
 * So the SKU is derived once, here, from the request itself rather than from a
 * label a caller remembers to pass. A call site cannot disagree with this about
 * what it is buying, because it does not get a say: the URL and the field mask
 * are the same two things Google prices on.
 *
 * Deliberately not a billing system. It counts calls and multiplies by the
 * published marginal price; it does not model free quotas, because a per-process
 * counter cannot know what the other instances already used this month. The
 * number to trust here is the **count**. The dollars are an upper bound that
 * ignores free tiers, and it says so in its own field name.
 */

/** A Google SKU this app can be billed for. */
export type GoogleSku =
  | 'text_search_essentials'
  | 'text_search_pro'
  | 'text_search_enterprise'
  | 'text_search_enterprise_atmosphere'
  | 'place_details_essentials'
  | 'place_details_pro'
  | 'place_details_enterprise'
  | 'place_details_enterprise_atmosphere'
  | 'place_photo'
  | 'autocomplete'
  | 'routes_compute'
  | 'unknown';

/**
 * Marginal price per 1,000 calls, USD, from Google's published Places and
 * Routes pricing as read on 2026-11-05.
 *
 * Free monthly quotas are recorded beside them for the reader, and are
 * deliberately NOT used in the arithmetic below — see the file comment.
 */
export const SKU_PRICE_PER_1000: Record<GoogleSku, number> = {
  text_search_essentials: 0,       // one tier is free without a cap
  text_search_pro: 32,             // 5,000 free
  text_search_enterprise: 35,      // 1,000 free
  text_search_enterprise_atmosphere: 40,
  place_details_essentials: 5,     // 10,000 free
  place_details_pro: 17,           // 5,000 free
  place_details_enterprise: 20,    // 1,000 free
  place_details_enterprise_atmosphere: 25,
  place_photo: 7,
  autocomplete: 2.83,              // 10,000 free
  routes_compute: 5,
  unknown: 0,
};

/**
 * The field names that lift a request out of Essentials.
 *
 * Matched as substrings against the mask, because Google's tiers are decided by
 * the most expensive field present and the mask is a flat comma list. The
 * `places.` prefix on a Text Search mask is ignored by matching the bare name.
 *
 * Incomplete by construction: a field nobody here asks for is not listed. An
 * unlisted field reads as Essentials, which under-reports rather than
 * over-reports — so a tier that appears in this app and not in this table shows
 * up as a count that is too cheap, which is the failure mode that gets noticed
 * when it is compared against the real invoice.
 */
const ATMOSPHERE_FIELDS = ['editorialsummary', 'reviews', 'generativesummary'];
const ENTERPRISE_FIELDS = [
  'nationalphonenumber', 'internationalphonenumber', 'websiteuri',
  'pricelevel', 'pricerange', 'regularopeninghours', 'currentopeninghours',
];
const PRO_FIELDS = [
  'primarytype', 'displayname', 'formattedaddress', 'addresscomponents',
  'photos', 'rating', 'usertotalratingcount', 'types', 'location',
];

type Tier = 'essentials' | 'pro' | 'enterprise' | 'enterprise_atmosphere';

/**
 * Which tier a field mask falls in.
 *
 * `location` counts as Pro here even though Place Details prices it as
 * Essentials. That asymmetry is Google's, measured on 2026-11-04: the same
 * field name is Essentials on Details and Pro on Text Search. Treating it as
 * Pro everywhere over-reports a Details call by one tier rather than
 * under-reporting a search by one — and the whole point of this module is to be
 * caught out by the invoice, not to flatter it.
 */
const tierOf = (fieldMask: string): Tier => {
  const mask = fieldMask.toLowerCase();
  const has = (names: string[]) => names.some(name => mask.includes(name));
  if (has(ATMOSPHERE_FIELDS)) return 'enterprise_atmosphere';
  if (has(ENTERPRISE_FIELDS)) return 'enterprise';
  if (has(PRO_FIELDS)) return 'pro';
  return 'essentials';
};

/** The SKU a request will be billed as, from the two things Google prices on. */
export const skuForRequest = (request: { url: string; fieldMask?: string }): GoogleSku => {
  const url = request.url.toLowerCase();
  const mask = request.fieldMask || '';

  if (url.includes('routes.googleapis.com')) return 'routes_compute';
  if (url.includes('places:autocomplete')) return 'autocomplete';
  // Checked before the details shape: a photo URL also contains `/places/`.
  if (url.includes('/media')) return 'place_photo';

  const tier = tierOf(mask);
  if (url.includes('places:searchtext')) {
    return tier === 'essentials' ? 'text_search_essentials'
      : tier === 'pro' ? 'text_search_pro'
      : tier === 'enterprise' ? 'text_search_enterprise'
      : 'text_search_enterprise_atmosphere';
  }
  if (url.includes('places.googleapis.com/v1/places/')) {
    return tier === 'essentials' ? 'place_details_essentials'
      : tier === 'pro' ? 'place_details_pro'
      : tier === 'enterprise' ? 'place_details_enterprise'
      : 'place_details_enterprise_atmosphere';
  }
  return 'unknown';
};

/** UTC, so a day means the same thing on every instance. */
const dayOf = (at: Date): string => at.toISOString().slice(0, 10);

type DayTotals = Record<string, number>;
const counts = new Map<string, DayTotals>();
/** When this process started counting, so a snapshot cannot be read as a month. */
let countingSince = new Date().toISOString();

/**
 * Records one billable call.
 *
 * Also emits a single structured line, because the in-memory tally dies with the
 * process and Render's free instance sleeps. The log outlives the tally; the
 * tally is what an endpoint can answer in one request. Neither is a substitute
 * for the invoice, and that is stated wherever this is read.
 */
export const recordGoogleCall = (
  request: { url: string; fieldMask?: string },
  at: Date = new Date(),
  log: (line: string) => void = message => console.log(message),
): GoogleSku => {
  const sku = skuForRequest(request);
  const day = dayOf(at);
  const totals = counts.get(day) || {};
  totals[sku] = (totals[sku] || 0) + 1;
  counts.set(day, totals);
  log(`[google-sku] ${day} ${sku} count=${totals[sku]}`);
  return sku;
};

export interface GoogleUsageSnapshot {
  countingSince: string;
  days: Array<{
    day: string;
    calls: DayTotals;
    /**
     * Marginal cost of those calls at published prices, **free quotas ignored**.
     * An upper bound on this process's share of one day, never a bill.
     */
    marginalUsdIgnoringFreeQuota: number;
  }>;
}

export const googleUsageSnapshot = (): GoogleUsageSnapshot => ({
  countingSince,
  days: [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, calls]) => ({
      day,
      calls,
      marginalUsdIgnoringFreeQuota: Number(
        Object.entries(calls)
          .reduce((total, [sku, count]) => total + count * (SKU_PRICE_PER_1000[sku as GoogleSku] ?? 0) / 1000, 0)
          .toFixed(4),
      ),
    })),
});

/** Tests only: the counters are process-global on purpose. */
export const resetGoogleUsage = (): void => {
  counts.clear();
  countingSince = new Date().toISOString();
};
