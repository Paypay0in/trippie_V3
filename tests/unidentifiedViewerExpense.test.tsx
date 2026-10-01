/**
 * @vitest-environment jsdom
 *
 * Whose expense is this.
 *
 * `resolveViewer` answers with the trip owner when it cannot match the signed-in
 * account to anyone on the roster, and it says so — `isResolved: false`. Nothing
 * read that flag, so the guess was written onto the ledger: the eSIM the second
 * traveller bought and recorded on her own phone is stored, in production, as
 * the owner's. On a trip that settles up afterwards, that is the one person
 * everyone would then be told to repay.
 *
 * An unattributed expense is a gap somebody notices and fixes. A confidently
 * wrong one is not, because nobody goes looking for it.
 */
import { describe, expect, it } from 'vitest';
import { resolveViewer } from '../services/tripRoster';
import type { TripMember } from '../types';

const OWNER_MEMBER_ID = 'trip-1:owner';

const roster: TripMember[] = [
  { id: OWNER_MEMBER_ID, name: 'Ann', type: 'owner', userId: 'account-ann' },
  { id: 'member-gina', name: 'Gina', type: 'member', userId: 'account-gina' },
];

/** What App does with the resolution when an expense is created. */
const attributionFor = (authUserId: string | undefined, members: TripMember[]): string | undefined => {
  const resolution = resolveViewer({ roster: members, authUserId, tripOwnerMemberId: OWNER_MEMBER_ID });
  return resolution.isResolved ? resolution.memberId : undefined;
};

describe('who a new expense is attributed to', () => {
  it('is the member whose account recorded it', () => {
    expect(attributionFor('account-gina', roster)).toBe('member-gina');
    expect(attributionFor('account-ann', roster)).toBe(OWNER_MEMBER_ID);
  });

  it('is nobody when the roster does not yet know this account', () => {
    // Her membership exists on the server but has not reached this device.
    const rosterWithoutHer = roster.filter((member) => member.type === 'owner');

    expect(resolveViewer({
      roster: rosterWithoutHer,
      authUserId: 'account-gina',
      tripOwnerMemberId: OWNER_MEMBER_ID,
    })).toMatchObject({ memberId: OWNER_MEMBER_ID, isResolved: false });

    // The owner is still the answer for permissions, and must not be the answer
    // for whose money this was.
    expect(attributionFor('account-gina', rosterWithoutHer)).toBeUndefined();
  });

  it('is nobody when there is no account at all', () => {
    expect(attributionFor(undefined, roster)).toBeUndefined();
  });
});
