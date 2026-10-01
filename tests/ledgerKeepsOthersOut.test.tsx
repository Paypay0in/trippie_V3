/**
 * @vitest-environment jsdom
 *
 * 「我也沒有想看到他的帳啊！」
 *
 * A shared ledger is not a shared feed. What this traveller has to settle
 * belongs in the list; what the other person bought for themselves does not.
 *
 * The first attempt at this filtered the list outright, and a bill the second
 * traveller had explicitly split with him vanished the night before they flew —
 * so this one folds rather than drops. The count is stated, one tap brings it
 * back, and no total anywhere is computed from this list.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseList from '../components/ExpenseList';
import { Category, Expense } from '../types';

const ME = 'muo3ht39hl3hpfed:owner';
const HER = 'muoal9czpaxkzw1l';

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, currency: 'TWD',
  category: Category.OTHER, date: '2026-10-02', phase: 'pre',
  ...over,
} as Expense);

/** The real ledger, with the payers it should have had. */
const flights = expense({ id: 'e-air', description: '機票', amount: 12000, payerId: ME, beneficiaries: [ME, HER] });
const herOwnThing = expense({ id: 'e-888', description: '哈哈', amount: 888, payerId: HER, beneficiaries: [HER] });
const sheSplitWithMe = expense({ id: 'e-sim', description: 'eSIM', amount: 500, payerId: HER, beneficiaries: [HER, ME] });

const list = (expenses: Expense[], viewer?: string) => render(
  <ExpenseList
    expenses={expenses}
    onDelete={() => undefined}
    onEdit={() => undefined}
    viewerMemberId={viewer}
    tripOwnerMemberId={ME}
  />,
);

afterEach(cleanup);

describe('somebody else’s money', () => {
  it('is not in this traveller’s list', () => {
    list([flights, herOwnThing], ME);

    expect(screen.getByText('機票')).toBeTruthy();
    expect(screen.queryByText('哈哈')).toBeNull();
    expect(screen.getByTestId('others-ledger-toggle').textContent).toContain('1 筆');
  });

  it('comes back on one tap, because hiding money is the worse failure', async () => {
    const user = userEvent.setup();
    list([flights, herOwnThing], ME);

    await user.click(screen.getByTestId('others-ledger-toggle'));
    expect(screen.getByText('哈哈')).toBeTruthy();
  });

  it('never folds away a bill she split with him — the one that was lost before', () => {
    list([sheSplitWithMe], ME);

    expect(screen.getByText('eSIM')).toBeTruthy();
    expect(screen.queryByTestId('others-ledger-toggle')).toBeNull();
  });

  it('says nothing and folds nothing when there is nobody else’s money here', () => {
    list([flights], ME);
    expect(screen.queryByTestId('others-ledger-toggle')).toBeNull();
  });

  it('shows everything when it does not know who is looking', () => {
    list([flights, herOwnThing], undefined);

    expect(screen.getByText('機票')).toBeTruthy();
    expect(screen.getByText('哈哈')).toBeTruthy();
    expect(screen.queryByTestId('others-ledger-toggle')).toBeNull();
  });
});
