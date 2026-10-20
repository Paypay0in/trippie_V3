import { describe, expect, it } from 'vitest';
import { buildTripRoster, ownerUserIdFor, resolveViewer } from './tripRoster';

/**
 * 「Sherry 的帳本 有帳但不能儲存 分帳的部分也不會自動計算」.
 *
 * The owner seat was built with `draft.ownerId || viewerUserId`, so a joined
 * trip whose `ownerId` had not arrived yet put her auth id in his seat — and
 * `resolveViewer` checks the owner seat first, so she matched as the owner
 * with `isResolved: true`. No banner, no warning, every permission question
 * answering 「yes, you are」.
 */
const HER = 'user-sherry';
const HIM = 'user-north';

/** Her seat on his trip, as the cloud pull writes it. */
const herSeat = { id: 'seat-sherry', name: 'Sherry', userId: HER, type: 'member' as const };

describe('ownerUserIdFor', () => {
  it('uses the stored owner when there is one', () => {
    expect(ownerUserIdFor({ storedOwnerId: HIM, viewerUserId: HER, companions: [herSeat] }))
      .toBe(HIM);
  });

  /*
    The evidence that matters: a companion seat carrying this account's id is
    proof this account is a member, which is proof it is not the owner.
  */
  it('refuses to name the reader as owner when they hold a companion seat', () => {
    expect(ownerUserIdFor({ storedOwnerId: undefined, viewerUserId: HER, companions: [herSeat] }))
      .toBeUndefined();
  });

  it('counts a seat whose id is the account id, which is how share codes join', () => {
    expect(ownerUserIdFor({
      storedOwnerId: undefined,
      viewerUserId: HER,
      companions: [{ id: HER, name: 'Sherry' }],
    })).toBeUndefined();
  });

  /* A trip only this device has ever had is genuinely the reader's. */
  it('still names the reader on a trip nobody else is on', () => {
    expect(ownerUserIdFor({ storedOwnerId: undefined, viewerUserId: HIM, companions: [] }))
      .toBe(HIM);
  });

  it('names nobody when there is nobody to name', () => {
    expect(ownerUserIdFor({ companions: [] })).toBeUndefined();
  });
});

/**
 * The reason it matters, end to end.
 */
describe('on a trip she joined, with the owner not yet known', () => {
  const rosterFor = (storedOwnerId?: string) => buildTripRoster({
    tripId: 'tokyo',
    ownerUserId: ownerUserIdFor({ storedOwnerId, viewerUserId: HER, companions: [herSeat] }),
    ownerName: '旅程建立者',
    companions: [herSeat],
  });

  it('resolves her to her own seat, not to his', () => {
    const resolution = resolveViewer({
      roster: rosterFor(undefined),
      authUserId: HER,
      tripOwnerMemberId: 'tokyo:owner',
    });

    expect(resolution).toEqual({
      memberId: 'seat-sherry', reason: 'member-user-match', isResolved: true,
    });
  });

  /*
    This is the one that cancelled the split. `calculateTripDebts` folds every
    owner alias onto the owner's id, so when she *was* the owner seat, she and
    he were one member and everything netted to zero.
  */
  it('keeps her and the owner as two different seats', () => {
    const roster = rosterFor(undefined);
    const owner = roster.find(member => member.type === 'owner');

    expect(owner?.userId).toBeUndefined();
    expect(roster.map(member => member.id)).toEqual(['tokyo:owner', 'seat-sherry']);
  });

  it('still resolves her once the owner is known', () => {
    expect(resolveViewer({
      roster: rosterFor(HIM),
      authUserId: HER,
      tripOwnerMemberId: 'tokyo:owner',
    }).memberId).toBe('seat-sherry');
  });

  /* And the owner, on his own device, is still the owner. */
  it('resolves him to the owner seat', () => {
    expect(resolveViewer({
      roster: buildTripRoster({
        tripId: 'tokyo',
        ownerUserId: ownerUserIdFor({ storedOwnerId: HIM, viewerUserId: HIM, companions: [herSeat] }),
        ownerName: '我',
        companions: [herSeat],
      }),
      authUserId: HIM,
      tripOwnerMemberId: 'tokyo:owner',
    })).toMatchObject({ memberId: 'tokyo:owner', reason: 'owner-user-match' });
  });
});
