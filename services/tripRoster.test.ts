import { describe, expect, it } from 'vitest';
import { Companion } from '../types';
import {
  buildTripRoster,
  canonicalizeMemberId,
  findRosterRejects,
  isOwnerShapedId,
  memberNameById,
  ownerMemberId,
  resolveViewer,
  resolveViewerMemberId,
} from './tripRoster';

const TRIP_ID = 'trip-1';
const OWNER_MEMBER = ownerMemberId(TRIP_ID);
const ANN_USER = 'user-ann';
const GINA_USER = 'user-gina';

const gina: Companion = { id: GINA_USER, name: 'Gina' };
const guestBob: Companion = { id: 'companion-bob', name: 'Bob' };

const roster = () =>
  buildTripRoster({
    tripId: TRIP_ID,
    ownerUserId: ANN_USER,
    ownerName: 'Ann',
    companions: [gina, guestBob],
    friends: [gina],
  });

describe('buildTripRoster', () => {
  it('puts the owner first with the canonical id and linked user', () => {
    const members = roster();
    expect(members[0]).toEqual({
      id: OWNER_MEMBER,
      name: 'Ann',
      userId: ANN_USER,
      type: 'owner',
    });
  });

  it('types a friend-linked companion as a member and a name-only one as a guest', () => {
    const members = roster();
    expect(members[1]).toEqual({
      id: GINA_USER,
      name: 'Gina',
      userId: GINA_USER,
      type: 'member',
    });
    expect(members[2]).toEqual({
      id: 'companion-bob',
      name: 'Bob',
      userId: undefined,
      type: 'guest',
    });
  });

  it('preserves companion ids exactly, so existing expenses keep resolving', () => {
    const members = roster();
    expect(members.map(member => member.id)).toEqual([
      OWNER_MEMBER,
      GINA_USER,
      'companion-bob',
    ]);
  });

  it('drops owner-shaped and duplicate companion ids instead of renaming them', () => {
    const companions: Companion[] = [
      { id: `${TRIP_ID}:owner`, name: '假的擁有者' },
      { id: 'draft-9:owner', name: '別趟的擁有者' },
      gina,
      { id: GINA_USER, name: 'Gina 重複' },
    ];
    const members = buildTripRoster({
      tripId: TRIP_ID,
      ownerUserId: ANN_USER,
      ownerName: 'Ann',
      companions,
      friends: [gina],
    });

    expect(members).toHaveLength(2);
    expect(members.map(member => member.id)).toEqual([OWNER_MEMBER, GINA_USER]);
    expect(findRosterRejects({ companions })).toEqual([
      { id: `${TRIP_ID}:owner`, reason: 'owner-shaped' },
      { id: 'draft-9:owner', reason: 'owner-shaped' },
      { id: GINA_USER, reason: 'duplicate' },
    ]);
  });

  it('falls back to 我 when the owner has no name', () => {
    const members = buildTripRoster({
      tripId: TRIP_ID,
      companions: [],
    });
    expect(members[0].name).toBe('我');
    expect(members[0].userId).toBeUndefined();
  });

  it('flags owner-shaped ids', () => {
    expect(isOwnerShapedId(`${TRIP_ID}:owner`)).toBe(true);
    expect(isOwnerShapedId('me')).toBe(true);
    expect(isOwnerShapedId(GINA_USER)).toBe(false);
  });
});

describe('resolveViewer', () => {
  it('resolves the signed-in owner to the owner member', () => {
    const resolution = resolveViewer({
      roster: roster(),
      authUserId: ANN_USER,
      tripOwnerMemberId: OWNER_MEMBER,
    });
    expect(resolution).toEqual({
      memberId: OWNER_MEMBER,
      reason: 'owner-user-match',
      isResolved: true,
    });
  });

  it('resolves a linked companion to their own member id, not the owner', () => {
    const resolution = resolveViewer({
      roster: roster(),
      authUserId: GINA_USER,
      tripOwnerMemberId: OWNER_MEMBER,
    });
    expect(resolution.memberId).toBe(GINA_USER);
    expect(resolution.isResolved).toBe(true);
    // The whole point of this ticket: the viewer is no longer forced to be the owner.
    expect(resolution.memberId).not.toBe(OWNER_MEMBER);
  });

  it('matches a share-scan companion whose id is the auth user id', () => {
    // Joined by scanning a share code: companion id is the joiner's user id and
    // there is no friend entry yet, so only the id-match path can find them.
    const joined = buildTripRoster({
      tripId: TRIP_ID,
      ownerUserId: ANN_USER,
      ownerName: 'Ann',
      companions: [{ id: GINA_USER, name: 'Gina' }],
      friends: [],
    });

    const resolution = resolveViewer({
      roster: joined,
      authUserId: GINA_USER,
      tripOwnerMemberId: OWNER_MEMBER,
    });
    expect(resolution).toEqual({
      memberId: GINA_USER,
      reason: 'member-id-match',
      isResolved: true,
    });
  });

  it('falls back to the owner when signed out, and says so', () => {
    const resolution = resolveViewer({
      roster: roster(),
      authUserId: undefined,
      tripOwnerMemberId: OWNER_MEMBER,
    });
    expect(resolution).toEqual({
      memberId: OWNER_MEMBER,
      reason: 'owner-fallback',
      isResolved: false,
    });
  });

  it('falls back to the owner for an account with no seat on this trip', () => {
    const resolution = resolveViewer({
      roster: roster(),
      authUserId: 'user-stranger',
      tripOwnerMemberId: OWNER_MEMBER,
    });
    expect(resolution.memberId).toBe(OWNER_MEMBER);
    expect(resolution.isResolved).toBe(false);
  });

  it('treats a blank auth id as signed out', () => {
    expect(
      resolveViewerMemberId({
        roster: roster(),
        authUserId: '   ',
        tripOwnerMemberId: OWNER_MEMBER,
      }),
    ).toBe(OWNER_MEMBER);
  });
});

describe('identity convergence', () => {
  it('collapses legacy and foreign owner encodings onto this trip owner', () => {
    expect(canonicalizeMemberId('me', OWNER_MEMBER)).toBe(OWNER_MEMBER);
    expect(canonicalizeMemberId('draft-9:owner', OWNER_MEMBER)).toBe(OWNER_MEMBER);
    expect(canonicalizeMemberId(GINA_USER, OWNER_MEMBER)).toBe(GINA_USER);
  });

  it('names members, with a fallback for ids no longer on the roster', () => {
    const members = roster();
    expect(memberNameById(members, GINA_USER)).toBe('Gina');
    expect(memberNameById(members, OWNER_MEMBER)).toBe('Ann');
    expect(memberNameById(members, 'gone')).toBe('其他旅伴');
  });
});
