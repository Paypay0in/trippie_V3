/**
 * @vitest-environment jsdom
 *
 * 「哈哈❤️ 這筆帳是 gina 新增的 看來被判斷成我新增的帳」
 *
 * 888 of the second traveller's own money sat in the owner's ledger, because
 * every expense this app created named the trip owner as payer regardless of
 * whose phone it was created on. Nothing on screen disagreed, and the error
 * only surfaced when the two of them compared totals two days before flying.
 *
 * The person holding the phone is the one spending, whenever the app knows who
 * that is; the owner remains the fallback only while the viewer is unresolved.
 */
import { describe, expect, it } from 'vitest';
import { buildTripRoster, resolveViewer } from '../services/tripRoster';

const TRIP = 'muo3ht39hl3hpfed';
const OWNER = `${TRIP}:owner`;
const HER_SEAT = 'muoal9czpaxkzw1l';
const HER_ACCOUNT = '113e8451-1484-446b-8c4c-71fe8cd7601c';
const HIS_ACCOUNT = '8b4c29bc-b53b-4b3f-89bb-d0efb0cc8871';

const roster = buildTripRoster({
  tripId: TRIP,
  ownerUserId: HIS_ACCOUNT,
  ownerName: 'Ann',
  companions: [{ id: HER_SEAT, name: 'Gina', userId: HER_ACCOUNT, type: 'member' }] as never,
  friends: [],
});

/** The rule App applies when creating an expense with no payer stated. */
const defaultPayer = (authUserId?: string) => {
  const resolution = resolveViewer({ roster, authUserId, tripOwnerMemberId: OWNER });
  return resolution.isResolved ? resolution.memberId : OWNER;
};

describe('who an expense belongs to by default', () => {
  it('is the traveller whose phone it is, not the owner of the trip', () => {
    expect(defaultPayer(HER_ACCOUNT)).toBe(HER_SEAT);
  });

  it('is still the owner on the owner’s own phone', () => {
    expect(defaultPayer(HIS_ACCOUNT)).toBe(OWNER);
  });

  it('falls back to the owner only when nobody is identified', () => {
    expect(defaultPayer(undefined)).toBe(OWNER);
    expect(defaultPayer('an-account-with-no-seat-here')).toBe(OWNER);
  });
});
