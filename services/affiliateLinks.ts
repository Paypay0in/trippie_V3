/**
 * Affiliate tracking on the booking buttons, off until somebody signs up.
 *
 * 「kkday那些可以有分潤計畫嗎 可以引導用戶去那邊買」 — they do run them, and the
 * buttons this would ride on already exist. What is missing is a contract, not
 * code.
 *
 * Deliberately parameter-driven rather than knowing anything about Klook's or
 * KKday's URLs. Every affiliate programme hands its partner a parameter name
 * and a value when they join, and those differ per programme and sometimes per
 * campaign. Hardcoding a guess at `?aid=` would be the same mistake this
 * codebase already made once with provider URLs: a link that looks official,
 * cannot be checked, and quietly earns nothing.
 *
 * So the pairs come from configuration:
 *
 *   AFFILIATE_ENABLED=true
 *   AFFILIATE_KLOOK=aid=123456
 *   AFFILIATE_KKDAY=cid=78910
 *
 * Nothing is appended until all three are set — an unset provider is simply a
 * plain link, which is what ships today.
 *
 * Not secrets. An affiliate id travels in a URL to the user's own browser and
 * is visible to anyone who looks at the address bar; it is configuration, not
 * a credential, and it is kept out of the repo because it belongs to whoever
 * signed the agreement rather than because it needs protecting.
 */

/** One tracking parameter: a name and a value, and never anything else. */
export interface AffiliatePair {
  name: string;
  value: string;
}

export interface AffiliateConfig {
  /** Query pairs by provider, already parsed. Empty when nothing is set up. */
  byProvider: Record<string, AffiliatePair[]>;
}

/*
  One pair, and the value may not contain the characters that would make it two.

  A test caught `aid=1&extra=2` being accepted whole: the value was 「anything」,
  so a single setting could append a second parameter nobody reviewed. The
  value is now restricted to what an id is actually made of.

  What that test asserted has since changed, and the change is deliberate
  rather than a lapse. GetYourGuide issues three parameters, so a setting now
  holds several pairs and `aid=1&extra=2` yields two rather than being refused
  outright. The protection it was written for still stands: a single *value*
  cannot carry `&` or `=`, so nothing is smuggled inside one. What is no longer
  enforced is 「a provider gets exactly one parameter」, which was never the
  protection — only the shape it happened to take when one was all we needed.
*/
const PARAM = /^([A-Za-z0-9_-]{1,40})=([A-Za-z0-9_.~-]{1,120})$/;

/*
  Several pairs, each one still checked on its own.

  GetYourGuide hands out three — `partner_id`, `travel_agent` and `cmp` — so a
  single pair is no longer enough to join a programme. The separator is what
  changes; the guard does not. Each pair is matched against the same `PARAM`
  and a malformed one is dropped rather than letting the rest through with it,
  because 「the value may not contain the characters that would make it two」 is
  the whole protection and splitting on `&` first is what keeps it true.

  A setting that produces no valid pair at all yields no tracking, which is
  the same inert state an unset provider has always had.

  The cap counts pairs that survived, not components that were offered. It used
  to be applied first, which meant eight malformed components ahead of a sound
  one threw the sound one away and reported nothing — a valid parameter lost in
  silence, and the opposite of 「a malformed one is dropped and the rest still
  apply」 written above. Order matters here, so it is asserted in a test.
*/
const MAX_PAIRS = 8;

export const parsePairs = (raw: string): AffiliatePair[] => raw
  .split('&')
  .map(part => part.trim())
  .filter(Boolean)
  .flatMap(part => {
    const match = PARAM.exec(part);
    return match ? [{ name: match[1], value: match[2] }] : [];
  })
  .slice(0, MAX_PAIRS);

/**
 * Reads the configuration, refusing anything that does not look like one pair.
 *
 * A malformed entry is dropped rather than half-applied: a URL carrying
 * `?=abc` or a stray `&` is worse than one carrying no tracking at all, and
 * the only person who would notice is the one reading a report that says zero.
 */
/** The programmes this app can carry tracking for. */
const PROVIDERS = ['klook', 'kkday', 'getyourguide'] as const;

export const affiliateConfig = (
  env: Record<string, string | undefined> = process.env,
): AffiliateConfig => {
  if (env.AFFILIATE_ENABLED !== 'true') return { byProvider: {} };

  const byProvider: AffiliateConfig['byProvider'] = {};
  PROVIDERS.forEach(provider => {
    const raw = (env[`AFFILIATE_${provider.toUpperCase()}`] || '').trim();
    const pairs = parsePairs(raw);
    if (pairs.length > 0) byProvider[provider] = pairs;
  });

  return { byProvider };
};

/**
 * The same URL with this provider's tracking pair on it, or the URL unchanged.
 *
 * Never overwrites a parameter the link already carries. A curated booking
 * link may be a campaign URL a human pasted in, complete with its own tracking
 * — replacing that would break the thing somebody checked by hand.
 */
export const withAffiliate = (
  provider: string,
  url: string,
  config: AffiliateConfig,
): string => {
  const pairs = config.byProvider[provider];
  if (!pairs?.length) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  /*
    Per parameter, not all-or-nothing.

    A curated link may already carry one of them — a campaign URL somebody
    pasted in complete with its own `cmp` — and the one it carries is the one
    a human checked. The others still go on: dropping all three because one
    was present would quietly stop the link earning anything.
  */
  pairs.forEach(pair => {
    if (parsed.searchParams.has(pair.name)) return;
    parsed.searchParams.set(pair.name, pair.value);
  });
  return parsed.toString();
};

/**
 * Whether any link on a card is earning a commission, so the card can say so.
 *
 * Disclosure is not optional and is not a footnote somewhere else in the app:
 * the obligation attaches to the link being shown, so the answer travels with
 * the links.
 */
export const hasAffiliateLinks = (
  providers: string[],
  config: AffiliateConfig,
): boolean => providers.some(provider => Boolean(config.byProvider[provider]));
