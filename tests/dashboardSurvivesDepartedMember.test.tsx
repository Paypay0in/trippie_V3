/**
 * @vitest-environment jsdom
 *
 * D-010. The home screen's settlement card crashes for the one traveller the
 * settlement repair exists for.
 *
 * `ViewerBalanceRow.member` is optional BY DESIGN — `resolveCounterparty`
 * fills it with `members.find(...)`, which is undefined exactly when a balance
 * names a companion who has left the trip. The money is still owed; only the
 * seat is gone. Dashboard then read `member.id` with no guard, so the screen
 * that is supposed to explain the unaccounted money is the screen that throws.
 *
 * The row always carries `memberId`. That is the id to use.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Dashboard from '../components/Dashboard';
import { buildTripRoster } from '../services/tripRoster';
import { Category, Expense } from '../types';

const TRIP = 'muo3ht39hl3hpfed';
const OWNER_SEAT = `${TRIP}:owner`;
const STAYING_SEAT = 'muoal9czpaxkzw1l';
const DEPARTED_SEAT = 'muozzzgonezzzz01';

/**
 * The roster holds the owner and the companion who is still here. It no
 * longer holds the one who left — but her share of the hotel is still owed.
 */
const members = buildTripRoster({
  tripId: TRIP,
  ownerUserId: 'his-account',
  ownerName: 'Ann',
  companions: [{ id: STAYING_SEAT, name: 'Gina' }] as never,
  friends: [],
});

/** Split with someone who is no longer on the trip: 20,000 of hotel. */
const sharedWithDeparted = {
  id: 'e-stay', description: '住宿', amount: 20000, twdAmount: 20000, currency: 'TWD',
  exchangeRate: 1, category: Category.ACCOMMODATION, paymentMethod: 'CASH_TWD',
  phase: 'pre', date: '2026-10-01', payerId: OWNER_SEAT,
  payerAllocations: { [OWNER_SEAT]: 20000 },
  beneficiaries: [OWNER_SEAT, STAYING_SEAT, DEPARTED_SEAT],
  splitMethod: 'EQUAL', splitAllocations: {}, createdByMemberId: OWNER_SEAT,
} as unknown as Expense;

type DashboardProps = React.ComponentProps<typeof Dashboard>;

/**
 * The seat fixtures and the expense are deliberately loose — this test is
 * about one guard, not about the twenty props the home screen takes — so the
 * merged object is cast once, here, rather than prop by prop.
 */
const baseProps = {
  companions: [{ id: STAYING_SEAT, name: 'Gina' }],
  members,
  batches: [],
  onExport: () => undefined,
  onAddCash: () => undefined,
  onAddExpense: () => undefined,
  onSettleRefund: () => undefined,
  onOpenSettlement: () => undefined,
  viewerMemberId: OWNER_SEAT,
  currentPhase: 'during',
};

const dashboard = (props: Partial<DashboardProps>) =>
  render(<Dashboard {...({ ...baseProps, ...props } as unknown as DashboardProps)} />);

afterEach(cleanup);

describe('the home settlement card when a balance names a departed companion', () => {
  it('renders instead of throwing', () => {
    expect(() =>
      dashboard({ expenses: [], allExpenses: [sharedWithDeparted] }),
    ).not.toThrow();
  });

  it('still reports the amount that is owed', () => {
    dashboard({ expenses: [], allExpenses: [sharedWithDeparted] });
    // 20,000 split three ways: the owner paid, so each of the other two
    // owes 6,667 — including the seat the roster can no longer name.
    expect(screen.getAllByText(/6,667/).length).toBeGreaterThan(0);
  });

  it('names the seat it cannot resolve rather than dropping the row', () => {
    dashboard({ expenses: [], allExpenses: [sharedWithDeparted] });
    // Both counterparties are listed: the one still here and the one gone.
    expect(screen.getAllByText(/6,667/).length).toBe(2);
  });
});
