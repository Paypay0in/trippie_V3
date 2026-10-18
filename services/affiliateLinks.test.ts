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

    expect(config.byProvider.klook).toEqual({ name: 'aid', value: '1' });
    expect(config.byProvider.kkday).toBeUndefined();
  });

  /*
    Half a parameter is worse than none: a URL carrying `?=abc` earns nothing
    and the only person who notices is the one reading a report of zeroes.
  */
  it('drops an entry that is not one clean pair', () => {
    ['', '=abc', 'aid', 'aid=', 'a id=1', 'aid=1&extra=2'].forEach(raw => {
      expect(affiliateConfig({ AFFILIATE_ENABLED: 'true', AFFILIATE_KLOOK: raw }).byProvider.klook).toBeUndefined();
    });
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
