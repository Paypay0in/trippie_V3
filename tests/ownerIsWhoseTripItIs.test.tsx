/**
 * @vitest-environment jsdom
 *
 * 「1. 他的結算頁面沒有顯示他需要給我多少錢
 *   2. 我有分帳給他的 沒有呈現給他請他確認 而是直接給他編輯權限」
 *
 * Both are the same fault, two screens apart. A trip pulled from the cloud
 * arrived without an owner — `fetchMyTrips` never selected the column — so the
 * app filled the gap with the account doing the pulling. On the second
 * traveller's phone she was therefore the owner of his 釜山.
 *
 * Every permission question then answered 「you are the owner」: her settlement
 * had nobody to owe, and a bill he had split to her offered an edit button
 * instead of 提出疑問.
 */
import { describe, expect, it } from 'vitest';
import { buildTripRoster, resolveViewer } from '../services/tripRoster';
import { canEditExpense } from '../services/expensePermissions';
import { buildViewerBalanceRows, sumPayable } from '../services/viewerBalances';
import { projectBatchSettlement } from '../services/settlementConsumption';
import { Category, Expense } from '../types';

const TRIP = 'muo3ht39hl3hpfed';
const OWNER_SEAT = `${TRIP}:owner`;
const HER_SEAT = 'muoal9czpaxkzw1l';
const HIS_ACCOUNT = '8b4c29bc-b53b-4b3f-89bb-d0efb0cc8871';
const HER_ACCOUNT = '113e8451-1484-446b-8c4c-71fe8cd7601c';

/** The roster as her phone builds it, once the trip carries its real owner. */
const roster = buildTripRoster({
  tripId: TRIP,
  ownerUserId: HIS_ACCOUNT,
  ownerName: 'Ann',
  companions: [{ id: HER_SEAT, name: 'Gina', userId: HER_ACCOUNT, type: 'member' }] as never,
  friends: [],
});

/** 住宿 20,000: he paid, split with her. */
const hisSplitBill = {
  id: 'e-stay', description: '住宿', amount: 20000, twdAmount: 20000, currency: 'TWD',
  exchangeRate: 1, category: Category.ACCOMMODATION, phase: 'pre', date: '2026-10-01',
  payerId: OWNER_SEAT, payerAllocations: { [OWNER_SEAT]: 20000 },
  beneficiaries: [OWNER_SEAT, HER_SEAT], splitMethod: 'EQUAL', splitAllocations: {},
  createdByMemberId: OWNER_SEAT,
} as unknown as Expense;

describe('on the second traveller’s phone', () => {
  it('resolves her as herself, not as the owner of his trip', () => {
    const viewer = resolveViewer({ roster, authUserId: HER_ACCOUNT, tripOwnerMemberId: OWNER_SEAT });

    expect(viewer.memberId).toBe(HER_SEAT);
    expect(viewer.isResolved).toBe(true);
  });

  it('shows what she owes him, rather than nothing', () => {
    const debts = projectBatchSettlement([hisSplitBill], roster, [HER_SEAT], OWNER_SEAT);
    const rows = buildViewerBalanceRows({
      debts,
      members: roster,
      ownerMemberId: OWNER_SEAT,
      viewerMemberId: HER_SEAT,
    });

    expect(sumPayable(rows)).toBe(10000);
  });

  it('and the same ledger read as the owner shows her owing him', () => {
    const debts = projectBatchSettlement([hisSplitBill], roster, [HER_SEAT], OWNER_SEAT);
    const rows = buildViewerBalanceRows({
      debts,
      members: roster,
      ownerMemberId: OWNER_SEAT,
      viewerMemberId: OWNER_SEAT,
    });

    // Negative from his seat is the same debt read from the other end: she
    // owes him 10,000, and both screens now agree on the number.
    expect(rows.map(row => row.amount)).toEqual([-10000]);
  });

  it('offers his bill for confirmation, not for editing', () => {
    expect(canEditExpense({
      expense: hisSplitBill,
      viewerMemberId: HER_SEAT,
      tripOwnerMemberId: OWNER_SEAT,
    })).toBe(false);
  });

  it('still lets the owner edit his own bill', () => {
    expect(canEditExpense({
      expense: hisSplitBill,
      viewerMemberId: OWNER_SEAT,
      tripOwnerMemberId: OWNER_SEAT,
    })).toBe(true);
  });
});
