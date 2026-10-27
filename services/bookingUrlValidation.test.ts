import { describe, expect, it, vi } from 'vitest';
import {
  checkUrlReachable,
  DeclaredBookingLink,
  validateBookingLinks,
  validateBookingUrlShape,
} from './bookingUrlValidation';

const link = (overrides: Partial<DeclaredBookingLink> = {}): DeclaredBookingLink => ({
  provider: 'klook',
  label: 'Klook',
  url: 'https://www.klook.com/activity/12345-spa-land-busan/',
  urlType: 'direct',
  ...overrides,
});

const respond = (status: number, finalUrl?: string) =>
  vi.fn(async (url: string) => ({ status, url: finalUrl ?? url }));

describe('validateBookingUrlShape', () => {
  it('accepts a provider URL on the provider\'s own domain', () => {
    expect(validateBookingUrlShape('klook', 'https://www.klook.com/activity/123/', 'direct')).toEqual({ ok: true });
    expect(validateBookingUrlShape('kkday', 'https://www.kkday.com/zh-tw/product/123', 'direct')).toEqual({ ok: true });
    // Subdomains and regional hosts count as the same provider.
    expect(validateBookingUrlShape('klook', 'https://affiliate.klook.com/x', 'direct')).toEqual({ ok: true });
  });

  it('rejects a malformed URL', () => {
    expect(validateBookingUrlShape('klook', 'not-a-url', 'direct')).toEqual({ ok: false, reason: 'malformed' });
    expect(validateBookingUrlShape('klook', '', 'direct')).toEqual({ ok: false, reason: 'malformed' });
    expect(validateBookingUrlShape('klook', '   ', 'direct')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('rejects anything that is not https', () => {
    expect(validateBookingUrlShape('klook', 'http://www.klook.com/activity/123/', 'direct')).toEqual({ ok: false, reason: 'not-https' });
    expect(validateBookingUrlShape('official', 'javascript:alert(1)', 'direct')).toEqual({ ok: false, reason: 'not-https' });
    expect(validateBookingUrlShape('official', 'ftp://example.com', 'direct')).toEqual({ ok: false, reason: 'not-https' });
  });

  it('rejects a provider link pointing at someone else\'s domain', () => {
    // The dangerous case: a button that says Klook and goes anywhere else.
    expect(validateBookingUrlShape('klook', 'https://evil.example/klook.com/activity', 'direct'))
      .toEqual({ ok: false, reason: 'wrong-provider-domain' });
    expect(validateBookingUrlShape('kkday', 'https://www.klook.com/activity/123/', 'direct'))
      .toEqual({ ok: false, reason: 'wrong-provider-domain' });
    // A lookalike domain is not the provider.
    expect(validateBookingUrlShape('klook', 'https://klook.com.evil.example/x', 'direct'))
      .toEqual({ ok: false, reason: 'wrong-provider-domain' });
  });

  it('rejects the known squatted host outright', () => {
    // Found live: looks like Spa Land's site, is a gambling page.
    expect(validateBookingUrlShape('official', 'https://www.spaland.co.kr/', 'direct'))
      .toEqual({ ok: false, reason: 'blocked-host' });
  });

  it('allows an official link on any domain, since operators live anywhere', () => {
    expect(validateBookingUrlShape('official', 'https://www.shinsegae.com/store/main.do', 'direct')).toEqual({ ok: true });
  });
});

describe('checkUrlReachable', () => {
  it('calls a 200 reachable', async () => {
    await expect(checkUrlReachable('https://www.klook.com/x', { linkFetch: respond(200) })).resolves.toBe('reachable');
  });

  it('calls 404 and 410 dead', async () => {
    await expect(checkUrlReachable('https://www.klook.com/x', { linkFetch: respond(404) })).resolves.toBe('dead');
    await expect(checkUrlReachable('https://www.klook.com/x', { linkFetch: respond(410) })).resolves.toBe('dead');
  });

  it('treats a 403 as inconclusive rather than a verdict', async () => {
    // Klook and KKday answer 403 to any server-side request, for real paths and
    // invented ones alike. Reading that as "dead" would be reading noise.
    await expect(checkUrlReachable('https://www.klook.com/x', { linkFetch: respond(403) })).resolves.toBe('inconclusive');
  });

  it('treats a network failure or timeout as inconclusive', async () => {
    const boom = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    await expect(checkUrlReachable('https://www.klook.com/x', { linkFetch: boom })).resolves.toBe('inconclusive');
  });

  it('does not trust a redirect that lands on another domain', async () => {
    await expect(checkUrlReachable('https://www.klook.com/x', { linkFetch: respond(200, 'https://parked-domains.example/sale') }))
      .resolves.toBe('inconclusive');
  });
});

describe('validateBookingLinks', () => {
  it('keeps a valid direct link and stamps when it was verified', async () => {
    const options = await validateBookingLinks([link()], { linkFetch: respond(200), now: new Date('2026-09-14T00:00:00Z') });
    expect(options).toEqual([{
      provider: 'klook',
      label: 'Klook',
      url: 'https://www.klook.com/activity/12345-spa-land-busan/',
      urlType: 'direct',
      verifiedAt: '2026-09-14',
    }]);
  });

  it('removes a 404 link entirely', async () => {
    await expect(validateBookingLinks([link()], { linkFetch: respond(404) })).resolves.toEqual([]);
  });

  it('removes malformed and wrong-domain links without any network call', async () => {
    const spy = respond(200);
    const options = await validateBookingLinks([
      link({ url: 'not-a-url' }),
      link({ url: 'http://www.klook.com/x' }),
      link({ provider: 'kkday', label: 'KKday', url: 'https://www.klook.com/x' }),
    ], { linkFetch: spy });
    expect(options).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps an unverifiable link but does not claim it was verified', async () => {
    const options = await validateBookingLinks([link()], { linkFetch: respond(403) });
    expect(options).toHaveLength(1);
    expect(options[0].verifiedAt).toBeUndefined();
  });

  it('lets one dead provider fall away without taking the good ones with it', async () => {
    const linkFetch = vi.fn(async (url: string) => ({ status: url.includes('kkday') ? 404 : 200, url }));
    const options = await validateBookingLinks([
      link({ provider: 'official', label: '官方網站', url: 'https://operator.example/tickets' }),
      link(),
      link({ provider: 'kkday', label: 'KKday', url: 'https://www.kkday.com/zh-tw/product/999' }),
    ], { linkFetch });

    expect(options.map(option => option.provider)).toEqual(['official', 'klook']);
  });

  it('preserves the declared urlType so the UI can label it honestly', async () => {
    const options = await validateBookingLinks([
      link({ urlType: 'direct' }),
      link({ provider: 'kkday', label: 'KKday', url: 'https://www.kkday.com/zh-tw/product/ls?keyword=x', urlType: 'search' }),
    ], { linkFetch: respond(200) });
    expect(options.map(option => option.urlType)).toEqual(['direct', 'search']);
  });

  it('returns nothing when nothing was declared', async () => {
    await expect(validateBookingLinks([], { linkFetch: respond(200) })).resolves.toEqual([]);
  });

  it('skips the network entirely when asked', async () => {
    const spy = respond(200);
    const options = await validateBookingLinks([link()], { linkFetch: spy, skipNetwork: true });
    expect(options).toHaveLength(1);
    expect(options[0].verifiedAt).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * The regression this ticket exists for: booking URLs must never be constructed
 * from a place name.
 */
describe('no provider URL is ever generated', () => {
  it('exposes no URL-building helper from the catalogue', async () => {
    const catalogue = await import('./placeCommerceCatalogue');
    expect('discoveryBookingOptions' in catalogue).toBe(false);
  });

  it('produces no provider links for a curated place that declares none', async () => {
    const { resolvePlaceCommerce } = await import('./placeCommerceLookup');
    const { commerce } = await resolvePlaceCommerce(
      { placeName: 'SPA LAND Centum City' },
      {
        catalogue: [{ nameKeys: ['spalandcentumcity'], admissionRequired: true, notes: ['未滿 19 歲不可入場'] }],
        skipNetwork: true,
      },
    );
    // Ticketed, so the section still appears — but with no buttons to click.
    expect(commerce).toMatchObject({ admissionRequired: true });
    expect((commerce as { bookingOptions: unknown[] }).bookingOptions).toEqual([]);
  });

  it('renders only the links a curated entry actually declares', async () => {
    const { resolvePlaceCommerce } = await import('./placeCommerceLookup');
    const { commerce } = await resolvePlaceCommerce(
      { placeName: 'SPA LAND Centum City' },
      {
        catalogue: [{
          nameKeys: ['spalandcentumcity'],
          admissionRequired: true,
          bookingLinks: [
            { provider: 'klook', label: 'Klook', url: 'https://www.klook.com/activity/12345/', urlType: 'direct' },
          ],
        }],
        skipNetwork: true,
      },
    );
    const options = (commerce as { bookingOptions: Array<{ provider: string; urlType: string }> }).bookingOptions;
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ provider: 'klook', urlType: 'direct' });
  });
});

/**
 * GetYourGuide, where a link presented as the ticket has to be the ticket.
 *
 * Every path on that host answers 403 — the real ones and the invented ones
 * alike — so nothing can tell a true product id from a number somebody made
 * up. This checks the one thing that is checkable: the shape of what a person
 * pasted. `placeCommerceLookup` records what it cost to learn that difference
 * with KKday.
 */
describe('a GetYourGuide link', () => {
  const activity = 'https://www.getyourguide.com/tokyo-l193/tokyo-teamlab-planets-entry-ticket-t260407';

  it('accepts a real activity address', () => {
    expect(validateBookingUrlShape('getyourguide', activity, 'direct').ok).toBe(true);
  });

  it('accepts it with the tracking parameters on', () => {
    expect(validateBookingUrlShape(
      'getyourguide',
      `${activity}?partner_id=BRLUDGG&cmp=share_to_earn`,
      'direct',
    ).ok).toBe(true);
  });

  /*
    The homepage offered as 「this exact activity」 is the failure worth
    catching: the card would say teamLab and the tap would land on a shop
    front.
  */
  it('refuses the homepage offered as the activity', () => {
    const verdict = validateBookingUrlShape('getyourguide', 'https://www.getyourguide.com/', 'direct');

    expect(verdict).toEqual({ ok: false, reason: 'not-an-activity-page' });
  });

  it('refuses a city listing offered as the activity', () => {
    expect(validateBookingUrlShape('getyourguide', 'https://www.getyourguide.com/tokyo-l193/', 'direct').ok)
      .toBe(false);
  });

  /* A link that says it is a search is allowed to be one. */
  it('allows the homepage when the link says it is a search', () => {
    expect(validateBookingUrlShape('getyourguide', 'https://www.getyourguide.com/', 'search').ok)
      .toBe(true);
  });

  /*
    There is no unstated type any more. The parameter used to default to
    「direct」, and the client — which did not pass it — therefore threw away
    search links the server had accepted. The rule now has one home: callers
    state the type, and a caller that forgets does not compile.
  */
  it('requires the caller to state the type, so the two layers cannot disagree', () => {
    const homepage = 'https://www.getyourguide.com/';

    expect(validateBookingUrlShape('getyourguide', homepage, 'direct').ok).toBe(false);
    expect(validateBookingUrlShape('getyourguide', homepage, 'search').ok).toBe(true);
  });

  /*
    The locale prefix. 「/zh-tw/tokyo-l193/…-t260407/」 is the same activity
    read in Chinese, and a Taiwanese traveller is the one most likely to be
    handed it. The pattern happens to allow it because it is not anchored at
    the start of the path — pinned here so that stays a decision rather than
    a coincidence somebody tightens away.
  */
  it('accepts the Chinese version of the same activity', () => {
    expect(validateBookingUrlShape(
      'getyourguide',
      'https://www.getyourguide.com/zh-tw/tokyo-l193/tokyo-teamlab-planets-tokyo-digital-art-museum-entry-ticket-t260407/',
      'direct',
    ).ok).toBe(true);
  });

  it('refuses a localised city listing offered as the activity', () => {
    expect(validateBookingUrlShape('getyourguide', 'https://www.getyourguide.com/zh-tw/tokyo-l193/', 'direct').ok)
      .toBe(false);
  });

  it('refuses a localised homepage offered as the activity', () => {
    expect(validateBookingUrlShape('getyourguide', 'https://www.getyourguide.com/zh-tw/', 'direct').ok)
      .toBe(false);
  });

  it('still refuses another company’s domain', () => {
    expect(validateBookingUrlShape('getyourguide', 'https://www.klook.com/x-l1/y-t2', 'direct'))
      .toEqual({ ok: false, reason: 'wrong-provider-domain' });
  });
});
