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

export interface AffiliateConfig {
  /** Query pairs by provider, already parsed. Empty when nothing is set up. */
  byProvider: Record<string, { name: string; value: string }>;
}

/*
  One pair, and the value may not contain the characters that would make it two.

  A test caught `aid=1&extra=2` being accepted whole: the value was 「anything」,
  so a single setting could append a second parameter nobody reviewed. The
  value is now restricted to what an id is actually made of.
*/
const PARAM = /^([A-Za-z0-9_-]{1,40})=([A-Za-z0-9_.~-]{1,120})$/;

/**
 * Reads the configuration, refusing anything that does not look like one pair.
 *
 * A malformed entry is dropped rather than half-applied: a URL carrying
 * `?=abc` or a stray `&` is worse than one carrying no tracking at all, and
 * the only person who would notice is the one reading a report that says zero.
 */
export const affiliateConfig = (
  env: Record<string, string | undefined> = process.env,
): AffiliateConfig => {
  if (env.AFFILIATE_ENABLED !== 'true') return { byProvider: {} };

  const byProvider: AffiliateConfig['byProvider'] = {};
  (['klook', 'kkday'] as const).forEach(provider => {
    const raw = (env[`AFFILIATE_${provider.toUpperCase()}`] || '').trim();
    const match = PARAM.exec(raw);
    if (match) byProvider[provider] = { name: match[1], value: match[2] };
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
  const pair = config.byProvider[provider];
  if (!pair) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.searchParams.has(pair.name)) return url;

  parsed.searchParams.set(pair.name, pair.value);
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
