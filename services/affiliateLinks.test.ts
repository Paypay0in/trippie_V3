/**
 * 「kkday那些可以有分潤計畫嗎」 — the mechanism, built and switched off until
 * somebody has actually signed up.
 */
import { describe, expect, it } from 'vitest';
import { affiliateConfig, hasAffiliateLinks, withAffiliate } from './affiliateLinks';

const live = {
  AFFILIATE_ENABLED: 'true',
  AFFILIATE_KLOOK: 'aid=123456',
  AFFILIATE_KKDAY: 'cid=78910',
};

describe('the gate', () => {
  it('is closed until it is deliberately opened', () => {
    expect(affiliateConfig({}).byProvider).toEqual({});
    expect(affiliateConfig({ AFFILIATE_KLOOK: 'aid=123456' }).byProvider).toEqual({});
    expect(affiliateConfig({ ...live, AFFILIATE_ENABLED: '1' }).byProvider).toEqual({});
  });

  it('opens one provider at a time', () => {
    const config = affiliateConfig({ AFFILIATE_ENABLED: 'true', AFFILIATE_KLOOK: 'aid=1' });

    expect(config.byProvider.klook).toEqual([{ name: 'aid', value: '1' }]);
    expect(config.byProvider.kkday).toBeUndefined();
  });

  /*
    Half a parameter is worse than none: a URL carrying `?=abc` earns nothing
    and the only person who notices is the one reading a report of zeroes.
  */
  it('drops an entry that is not a clean pair', () => {
    ['', '=abc', 'aid', 'aid=', 'a id=1'].forEach(raw => {
      expect(affiliateConfig({ AFFILIATE_ENABLED: 'true', AFFILIATE_KLOOK: raw }).byProvider.klook).toBeUndefined();
    });
  });

  /*
    Several pairs, because a programme can hand out several.

    GetYourGuide gives three — `partner_id`, `travel_agent`, `cmp` — and an
    earlier version of this rejected anything containing an `&` outright. That
    guard existed to stop one setting smuggling a parameter nobody reviewed,
    and it is still here: the string is split first and then every pair is
    matched against the same expression, so what cannot get through is a value
    carrying its own separator — not a second parameter somebody meant.
  */
  it('accepts several pairs, each one checked on its own', () => {
    const config = affiliateConfig({
      AFFILIATE_ENABLED: 'true',
      AFFILIATE_GETYOURGUIDE: 'partner_id=BRLUDGG&travel_agent=1&cmp=share_to_earn',
    });

    expect(config.byProvider.getyourguide).toEqual([
      { name: 'partner_id', value: 'BRLUDGG' },
      { name: 'travel_agent', value: '1' },
      { name: 'cmp', value: 'share_to_earn' },
    ]);
  });

  /*
    The cap counts what survived, not what was offered.

    Applied the other way round, eight malformed components ahead of a sound one
    threw the sound one away and reported nothing at all — a valid parameter
    lost in silence, which is precisely what 「drops the malformed one and keeps
    the rest」 promises will not happen. A reviewer found this; it reproduces
    with eight pieces of junk and one real pair.
  */
  it('keeps a sound pair that arrives behind more junk than the cap allows', () => {
    const raw = [...Array(8).fill('bad'), 'aid=1'].join('&');

    expect(affiliateConfig({ AFFILIATE_ENABLED: 'true', AFFILIATE_KLOOK: raw }).byProvider.klook)
      .toEqual([{ name: 'aid', value: '1' }]);
  });

  it('still refuses to carry more than the cap once they are all sound', () => {
    const raw = Array.from({ length: 12 }, (_, i) => `p${i}=v${i}`).join('&');

    expect(affiliateConfig({ AFFILIATE_ENABLED: 'true', AFFILIATE_KLOOK: raw }).byProvider.klook)
      .toHaveLength(8);
  });

  /*
    Klook and KKday changed with this, and the change is stated rather than
    implied.

    A setting used to have to be exactly one pair, so `aid=1&extra=2` was
    refused whole; the assertion saying so was removed when several pairs became
    supported, which left the new behaviour true but untested. It is pinned here
    instead. The protection that assertion existed for is still intact — a
    single value cannot contain `&` or `=`, so nothing rides inside one — and
    what went away is 「one parameter per provider」, which GetYourGuide's three
    made untenable.
  */
  it('now gives Klook both pairs where it once refused the whole setting', () => {
    expect(affiliateConfig({ AFFILIATE_ENABLED: 'true', AFFILIATE_KLOOK: 'aid=1&extra=2' }).byProvider.klook)
      .toEqual([{ name: 'aid', value: '1' }, { name: 'extra', value: '2' }]);
  });

  it('drops the malformed pair and keeps the sound ones', () => {
    const config = affiliateConfig({
      AFFILIATE_ENABLED: 'true',
      AFFILIATE_GETYOURGUIDE: 'partner_id=BRLUDGG&=broken&cmp=share_to_earn',
    });

    expect(config.byProvider.getyourguide?.map(pair => pair.name))
      .toEqual(['partner_id', 'cmp']);
  });

  /* A value still may not contain what would make it a second parameter. */
  it('refuses a value carrying its own separator', () => {
    const config = affiliateConfig({
      AFFILIATE_ENABLED: 'true',
      AFFILIATE_GETYOURGUIDE: 'partner_id=a?b#c',
    });

    expect(config.byProvider.getyourguide).toBeUndefined();
  });
});

describe('GetYourGuide', () => {
  const live = {
    AFFILIATE_ENABLED: 'true',
    AFFILIATE_GETYOURGUIDE: 'partner_id=BRLUDGG&travel_agent=1&cmp=share_to_earn',
  };

  it('puts all three on a product link', () => {
    const url = withAffiliate(
      'getyourguide',
      'https://www.getyourguide.com/tokyo-l193/teamlab-planets-t260407',
      affiliateConfig(live),
    );
    const params = new URL(url).searchParams;

    expect(params.get('partner_id')).toBe('BRLUDGG');
    expect(params.get('travel_agent')).toBe('1');
    expect(params.get('cmp')).toBe('share_to_earn');
  });

  /*
    A curated link may already carry one of them, and the one it carries is
    the one a human checked. The others still go on — dropping all three
    because of one would quietly stop the link earning anything.
  */
  it('keeps a parameter the link already had, and adds the rest', () => {
    const url = withAffiliate(
      'getyourguide',
      'https://www.getyourguide.com/tokyo-l193/teamlab-t260407?cmp=special',
      affiliateConfig(live),
    );
    const params = new URL(url).searchParams;

    expect(params.get('cmp')).toBe('special');
    expect(params.get('partner_id')).toBe('BRLUDGG');
  });
});

describe('withAffiliate', () => {
  const config = affiliateConfig(live);

  it('appends the configured pair', () => {
    const url = withAffiliate('klook', 'https://www.klook.com/zh-TW/search/?query=abc', config);

    expect(new URL(url).searchParams.get('aid')).toBe('123456');
    expect(new URL(url).searchParams.get('query')).toBe('abc');
  });

  /* A curated campaign URL a human pasted in already carries its own. */
  it('never overwrites a parameter the link already has', () => {
    const url = 'https://www.klook.com/activity/1/?aid=someone-else';

    expect(withAffiliate('klook', url, config)).toBe(url);
  });

  it('leaves a provider nobody configured alone', () => {
    const url = 'https://www.mot-art-museum.jp/';

    expect(withAffiliate('official', url, config)).toBe(url);
  });

  it('leaves a malformed URL alone rather than mangling it', () => {
    expect(withAffiliate('klook', 'not a url', config)).toBe('not a url');
  });

  it('changes nothing at all while the gate is closed', () => {
    const url = 'https://www.klook.com/zh-TW/search/?query=abc';

    expect(withAffiliate('klook', url, affiliateConfig({}))).toBe(url);
  });
});

/* Disclosure attaches to the link being shown, so the card has to be able to ask. */
describe('hasAffiliateLinks', () => {
  it('answers for the providers on a card', () => {
    expect(hasAffiliateLinks(['official', 'klook'], affiliateConfig(live))).toBe(true);
    expect(hasAffiliateLinks(['official'], affiliateConfig(live))).toBe(false);
    expect(hasAffiliateLinks(['klook'], affiliateConfig({}))).toBe(false);
  });
});
