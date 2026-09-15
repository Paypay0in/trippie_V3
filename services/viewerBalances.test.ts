import { describe, expect, it } from 'vitest';
import { TripMember } from '../types';
import {
  buildViewerBalanceRows,
  countPayable,
  countReceivable,
  sumPayable,
  sumReceivable,
} from './viewerBalances';

const OWNER = 'trip-1:owner';
const GINA = 'member-gina';
const BOB = 'member-bob';

const members: TripMember[] = [
  { id: OWNER, name: '旅人', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
  { id: BOB, name: 'Bob', type: 'guest' },
];

// Gina owes 3,250 and Bob owes 1,000; the owner is up 4,250.
const debts = { [OWNER]: 4250, [GINA]: -3250, [BOB]: -1000 };

describe('balances from the owner seat', () => {
  it('lists every member with their own net amount', () => {
    const rows = buildViewerBalanceRows({
      debts,
      members,
      ownerMemberId: OWNER,
      viewerMemberId: OWNER,
    });

    expect(rows.map(row => [row.member.id, row.amount])).toEqual([
      [GINA, -3250],
      [BOB, -1000],
    ]);
    expect(sumReceivable(rows)).toBe(4250);
    expect(sumPayable(rows)).toBe(0);
    expect(countReceivable(rows)).toBe(2);
  });

  it('defaults to the owner when no viewer is given', () => {
    const rows = buildViewerBalanceRows({ debts, members, ownerMemberId: OWNER });
    expect(rows).toHaveLength(2);
    expect(sumReceivable(rows)).toBe(4250);
  });

  it('drops balances that are only rounding noise', () => {
    const rows = buildViewerBalanceRows({
      debts: { [OWNER]: 0.2, [GINA]: -0.2 },
      members,
      ownerMemberId: OWNER,
    });
    expect(rows).toEqual([]);
  });
});

describe('balances from another member seat', () => {
  it('turns the owner-centric numbers around', () => {
    const rows = buildViewerBalanceRows({
      debts,
      members,
      ownerMemberId: OWNER,
      viewerMemberId: GINA,
    });

    // Gina pays the owner; she is owed nothing.
    expect(rows).toHaveLength(1);
    expect(rows[0].member.id).toBe(OWNER);
    expect(rows[0].amount).toBe(3250);
    expect(sumPayable(rows)).toBe(3250);
    expect(sumReceivable(rows)).toBe(0);
    expect(countPayable(rows)).toBe(1);
  });

  it('never hands a member someone else’s balance', () => {
    // Bob's row must be about Bob and the owner — Gina's 3,250 is not his
    // business, and reading her net amount as "owes me" is the original bug.
    const rows = buildViewerBalanceRows({
      debts,
      members,
      ownerMemberId: OWNER,
      viewerMemberId: BOB,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].member.id).toBe(OWNER);
    expect(rows[0].amount).toBe(1000);
  });

  it('shows a member who is owed money as receiving it', () => {
    // Gina paid for everyone: the owner owes her.
    const rows = buildViewerBalanceRows({
      debts: { [OWNER]: -2000, [GINA]: 2000 },
      members,
      ownerMemberId: OWNER,
      viewerMemberId: GINA,
    });

    expect(rows[0].member.id).toBe(OWNER);
    expect(rows[0].amount).toBe(-2000);
    expect(sumReceivable(rows)).toBe(2000);
    expect(sumPayable(rows)).toBe(0);
  });

  it('returns nothing for a member with no outstanding transfer', () => {
    expect(
      buildViewerBalanceRows({
        debts: { [OWNER]: 1000, [GINA]: -1000, [BOB]: 0 },
        members,
        ownerMemberId: OWNER,
        viewerMemberId: BOB,
      }),
    ).toEqual([]);
  });

  it('skips ids that are no longer on the roster', () => {
    const rows = buildViewerBalanceRows({
      debts: { [OWNER]: 500, 'member-gone': -500 },
      members,
      ownerMemberId: OWNER,
      viewerMemberId: OWNER,
    });
    expect(rows).toEqual([]);
  });
});
