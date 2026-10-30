import { BookingUrlType, PlaceBookingOption } from '../types';

/**
 * Gatekeeper for every booking link Trippie renders.
 *
 * A button the user can press has to land somewhere real, so a URL earns its
 * button by being *declared* by a trustworthy source and then *validated* — never
 * by being constructed from a place name. Guessing a provider URL produces a link
 * that looks authoritative and may go nowhere, which is worse than no button.
 */

/**
 * Domains each provider is allowed to live on.
 *
 * A "klook" option pointing anywhere but Klook is either a mistake or an attempt
 * to borrow the provider's credibility, and is rejected either way. `official`
 * has no allowlist — an operator can be on any domain — so it is gated on
 * provenance instead: it must come from the venue's own declared site.
 */
export const PROVIDER_DOMAINS: Record<string, string[]> = {
  klook: ['klook.com'],
  kkday: ['kkday.com'],
  getyourguide: ['getyourguide.com'],
};

/**
 * What a GetYourGuide activity page's address actually looks like.
 *
 * 「`/tokyo-l193/tokyo-teamlab-planets-…-t260407`」 — a city is `-l` and a
 * number, an activity is `-t` and a number, and the slug between them is
 * decoration.
 *
 * This is a shape check and emphatically not a licence to build one. Every
 * path on that host answers 403, the correct ones and the invented ones alike,
 * so nothing here can tell a real product id from a number somebody made up —
 * which is the exact trap `placeCommerceLookup` records paying for once
 * already with KKday. A link reaches this function because a person confirmed
 * it in a browser; this only catches the case where what they pasted was a
 * search page, a blog post or the homepage rather than the activity.
 */
export const GETYOURGUIDE_ACTIVITY_PATH = /\/[a-z0-9-]+-l\d+\/[a-z0-9-]+-t\d+\/?$/i;

/**
 * Hosts that are known not to be what a naive lookup would assume. This one is
 * here because it was found live: spaland.co.kr looks like Spa Land's site and is
 * a domain-squatted gambling page. A link like that is exactly the failure this
 * module exists to prevent.
 */
export const BLOCKED_HOSTS = ['spaland.co.kr'];

export type BookingUrlRejection =
  | 'malformed'
  | 'not-https'
  | 'wrong-provider-domain'
  | 'blocked-host'
  | 'not-an-activity-page'
  | 'unreachable';

export type BookingUrlVerdict =
  | { ok: true }
  | { ok: false; reason: BookingUrlRejection };

const hostOf = (url: URL): string => url.hostname.toLowerCase().replace(/^www\./, '');

/** True when `host` is the domain itself or a subdomain of it. */
const matchesDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

/**
 * The checks that need no network: shape, scheme, and whether the domain is one
 * this provider is allowed to be on.
 */
export const validateBookingUrlShape = (
  provider: string,
  url: string,
  /*
    What the link claims to be. Required, with no default: a default made the
    client drop valid `search` links the server had already accepted, because
    the omission read as 「direct」 instead of failing. Every caller says it out
    loud, so the next one that forgets is a compile error rather than two code
    paths quietly disagreeing.
  */
  urlType: BookingUrlType,
): BookingUrlVerdict => {
  let parsed: URL;
  try {
    parsed = new URL((url || '').trim());
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  // http:// is not acceptable for a link we are vouching for.
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'not-https' };

  const host = hostOf(parsed);
  if (!host) return { ok: false, reason: 'malformed' };
  if (BLOCKED_HOSTS.some(blocked => matchesDomain(host, blocked))) {
    return { ok: false, reason: 'blocked-host' };
  }

  const allowed = PROVIDER_DOMAINS[provider];
  if (allowed && !allowed.some(domain => matchesDomain(host, domain))) {
    return { ok: false, reason: 'wrong-provider-domain' };
  }

  /*
    A GetYourGuide link offered as 「this exact activity」 has to be one.

    Only when it claims to be direct. A `search` link is allowed to be the
    homepage or a listing — that is what the type means, and the card words it
    as a search rather than as the ticket. The failure this catches is the one
    that happened to KKday from the other direction: a link presented as the
    product and landing somewhere else.
  */
  if (provider === 'getyourguide' && urlType === 'direct'
      && !GETYOURGUIDE_ACTIVITY_PATH.test(parsed.pathname)) {
    return { ok: false, reason: 'not-an-activity-page' };
  }

  return { ok: true };
};

type Fetcher = (url: string, init?: { method?: string; redirect?: string; signal?: AbortSignal }) => Promise<{ status: number; url?: string }>;

/** Statuses that prove a link is not usable. Anything else is inconclusive. */
const DEAD_STATUSES = new Set([404, 410]);

const REACHABILITY_TIMEOUT_MS = 6_000;

/**
 * Asks whether a URL is actually reachable, and is deliberate about what an
 * answer means.
 *
 * Only a definite "this is gone" — 404 or 410 — rejects a link. A 403, a timeout
 * or a network error proves nothing: every major booking platform answers 403 to
 * a server-side request regardless of whether the path is real, so treating that
 * as a verdict would be reading noise. Those come back `inconclusive`, and the
 * caller decides what a link it could not check is worth.
 */
export const checkUrlReachable = async (
  url: string,
  deps: { linkFetch?: Fetcher } = {},
): Promise<'reachable' | 'dead' | 'inconclusive'> => {
  const doFetch = deps.linkFetch || (globalThis.fetch as unknown as Fetcher);
  if (!doFetch) return 'inconclusive';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
  try {
    const response = await doFetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    if (DEAD_STATUSES.has(response.status)) return 'dead';

    // A redirect that lands on a different registrable domain is a parked-page or
    // hijack signature, not a usable destination.
    if (response.url) {
      try {
        if (hostOf(new URL(response.url)) !== hostOf(new URL(url))) return 'inconclusive';
      } catch { /* an unreadable final URL is simply not extra evidence */ }
    }

    return response.status >= 200 && response.status < 400 ? 'reachable' : 'inconclusive';
  } catch {
    return 'inconclusive';
  } finally {
    clearTimeout(timer);
  }
};

export interface DeclaredBookingLink {
  provider: string;
  label: string;
  /**
   * i18n key for the label, when the label is the product's own words.
   *
   * Absent when `label` is a brand name — Klook, KKday — which is the same word
   * in every language. Resolved by the card rather than here: these links are
   * built server-side, and `i18n/config` is the browser's. See
   * `tests/serverNeverImportsBrowserI18n.test.ts`, and `officialTravelLinks` for
   * the same `labelKey` shape.
   */
  labelKey?: string;
  url: string;
  urlType: BookingUrlType;
}

/**
 * Validates declared links and returns only the ones that earned a button.
 *
 * A link that could not be checked is still rendered, but without `verifiedAt` —
 * every link reaching here was declared by a human or by the venue's own Google
 * record, so "I could not reach it from a server" is not grounds to hide it. What
 * this function can never do is manufacture a link; the guessing it used to guard
 * against no longer exists upstream.
 */
export const validateBookingLinks = async (
  declared: DeclaredBookingLink[],
  deps: { linkFetch?: Fetcher; now?: Date; skipNetwork?: boolean } = {},
): Promise<PlaceBookingOption[]> => {
  const checkedAt = (deps.now || new Date()).toISOString().slice(0, 10);

  const results = await Promise.all(declared.map(async link => {
    const shape = validateBookingUrlShape(link.provider, link.url, link.urlType);
    if (!shape.ok) return null;
    if (deps.skipNetwork) {
      return {
        provider: link.provider,
        label: link.label,
        ...(link.labelKey ? { labelKey: link.labelKey } : {}),
        url: link.url.trim(),
        urlType: link.urlType,
      };
    }

    const reachability = await checkUrlReachable(link.url.trim(), deps);
    if (reachability === 'dead') return null;
    // One bad provider never takes a good one down with it: each link is judged
    // on its own, and a null here simply drops that single button.
    return {
      provider: link.provider,
      label: link.label,
      ...(link.labelKey ? { labelKey: link.labelKey } : {}),
      url: link.url.trim(),
      urlType: link.urlType,
      ...(reachability === 'reachable' ? { verifiedAt: checkedAt } : {}),
    };
  }));

  return results.filter((option): option is PlaceBookingOption => option !== null);
};
