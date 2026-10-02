/**
 * @vitest-environment jsdom
 *
 * 「旅行中這邊這個欄位也有結算功能 但沒有顯示帳目狀況」.
 *
 * Every figure on that screen is about one phase, so the screen is handed one
 * phase of the ledger — and the settlement block inherited the slice. On 旅行中,
 * with nothing spent yet in Busan, it reported 「目前沒有需要結算的款項」 while the
 * other traveller owed half a flight and half a hotel booked before they left.
 *
 * A debt does not belong to a tab.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Dashboard from '../components/Dashboard';
import { buildTripRoster } from '../services/tripRoster';
import { Category, Expense } from '../types';

const TRIP = 'muo3ht39hl3hpfed';
const OWNER_SEAT = `${TRIP}:owner`;
const HER_SEAT = 'muoal9czpaxkzw1l';

const members = buildTripRoster({
  tripId: TRIP,
  ownerUserId: 'his-account',
  ownerName: 'Ann',
  companions: [{ id: HER_SEAT, name: 'Gina' }] as never,
  friends: [],
});

/** Booked before departure, split with her: 20,000 of hotel. */
const preTripHotel = {
  id: 'e-stay', description: '住宿', amount: 20000, twdAmount: 20000, currency: 'TWD',
  exchangeRate: 1, category: Category.ACCOMMODATION, paymentMethod: 'CASH_TWD',
  phase: 'pre', date: '2026-10-01', payerId: OWNER_SEAT,
  payerAllocations: { [OWNER_SEAT]: 20000 }, beneficiaries: [OWNER_SEAT, HER_SEAT],
  splitMethod: 'EQUAL', splitAllocations: {}, createdByMemberId: OWNER_SEAT,
} as unknown as Expense;

const dashboard = (props: Record<string, unknown>) =>
  render(
    <Dashboard
      companions={[{ id: HER_SEAT, name: 'Gina' }] as never}
      members={members}
      batches={[]}
      onExport={() => undefined}
      onAddCash={() => undefined}
      onAddExpense={() => undefined}
      onSettleRefund={() => undefined}
      onOpenSettlement={() => undefined}
      viewerMemberId={OWNER_SEAT}
      currentPhase="during"
      {...(props as never)}
    />,
  );

afterEach(cleanup);

describe('the settlement block on 旅行中', () => {
  it('reports a debt from before the trip, with nothing spent yet in Korea', () => {
    dashboard({ expenses: [], allExpenses: [preTripHotel] });

    expect(screen.getByText(/Gina/)).toBeTruthy();
    expect(screen.getByText(/10,000/)).toBeTruthy();
    expect(screen.queryByText('目前沒有需要結算的款項')).toBeNull();
  });

  it('still says nothing when nobody owes anybody', () => {
    dashboard({ expenses: [], allExpenses: [] });

    expect(screen.getByText('目前沒有需要結算的款項')).toBeTruthy();
  });

  it('falls back to the phase ledger when no trip-wide one is given', () => {
    dashboard({ expenses: [preTripHotel] });

    expect(screen.getByText(/10,000/)).toBeTruthy();
  });
});
