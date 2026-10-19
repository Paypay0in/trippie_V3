import { describe, expect, it } from 'vitest';
import { identityPlan, sameIdentity } from './tripIdentityPlan';

const tokyo = { name: '東京', destination: '東京', startDate: '2026-10-20', endDate: '2026-10-24' };
const renamed = { ...tokyo, name: '東京美食團' };
const busan = { name: '釜山', destination: '釜山', startDate: '2026-10-02', endDate: '2026-10-06' };

describe('identityPlan', () => {
  it('does nothing when both copies agree', () => {
    expect(identityPlan({ local: tokyo, remote: tokyo, isOwner: true, openedWith: tokyo }))
      .toEqual({ action: 'nothing' });
  });

  it('does nothing before the cloud has been read', () => {
    expect(identityPlan({ local: tokyo, isOwner: true, openedWith: tokyo }))
      .toEqual({ action: 'nothing' });
  });

  /* 「我把東京加他了」 — and his rename never reached her phone. */
  it('publishes the owner\'s rename', () => {
    expect(identityPlan({ local: renamed, remote: tokyo, isOwner: true, openedWith: tokyo }))
      .toEqual({ action: 'push', identity: renamed });
  });

  /*
    「我的釜山不見了」 — a local accident must not be published just because the
    trip was opened. Nobody typed this, so nobody publishes it.
  */
  it('does not publish a disagreement that was already there when it opened', () => {
    expect(identityPlan({ local: tokyo, remote: busan, isOwner: true, openedWith: tokyo }))
      .toEqual({ action: 'nothing' });
  });

  it('takes the cloud\'s name on a trip somebody else owns', () => {
    expect(identityPlan({ local: tokyo, remote: renamed, isOwner: false, openedWith: tokyo }))
      .toEqual({ action: 'pull', identity: renamed });
  });

  it('never pulls an empty name over one that says something', () => {
    expect(identityPlan({ local: tokyo, remote: { name: '  ' }, isOwner: false, openedWith: tokyo }))
      .toEqual({ action: 'nothing' });
  });

  it('never publishes an empty name either', () => {
    expect(identityPlan({
      local: { ...tokyo, name: '' }, remote: tokyo, isOwner: true, openedWith: tokyo,
    })).toEqual({ action: 'nothing' });
  });

  it('publishes a change of dates, not only of name', () => {
    const extended = { ...tokyo, endDate: '2026-10-26' };
    expect(identityPlan({ local: extended, remote: tokyo, isOwner: true, openedWith: tokyo }))
      .toEqual({ action: 'push', identity: extended });
  });
});

describe('sameIdentity', () => {
  it('ignores surrounding space and absent fields', () => {
    expect(sameIdentity({ name: ' 東京 ' }, { name: '東京', destination: '' })).toBe(true);
  });

  it('is false when either side is missing', () => {
    expect(sameIdentity(undefined, tokyo)).toBe(false);
  });
});
