/**
 * @vitest-environment jsdom
 *
 * 「這個帳若不是我花費的，根本不需要出現在我的帳上」.
 *
 * Half right. A shared ledger has to show everybody's bills — there is nothing
 * to settle against one that hides them. What it must not do is hand one
 * person the other's total: 「已支出 NT$ 13,388」 stood on the screen of
 * somebody who had paid 12,500 of it, the remaining 888 recorded by the
 * traveller beside him, with nothing saying so.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WalletPreScreen from '../components/WalletPreScreen';
import { Category, PaymentMethod } from '../types';
import type { Expense } from '../types';

const ANN = 'trip:owner';
const GINA = 'seat-gina';

const expense = (fields: Partial<Expense>): Expense => ({
  id: 'e-1',
  description: '',
  amount: 100,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 100,
  category: Category.OTHER,
  paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'pre',
  date: '2026-10-02',
  payerId: ANN,
  beneficiaries: [],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...fields,
});

/** Two of his, and one she paid that they are splitting. */
const ledger = [
  expense({ id: 'a', amount: 500, category: Category.SIM_WIFI, payerId: ANN, beneficiaries: [ANN] }),
  expense({ id: 'b', amount: 12000, category: Category.FLIGHT, payerId: ANN, beneficiaries: [ANN, GINA] }),
  expense({ id: 'c', amount: 888, category: Category.OTHER, payerId: GINA, beneficiaries: [ANN, GINA] }),
];

const renderWallet = (expenses: Expense[], viewerMemberId = ANN) =>
  render(
    <WalletPreScreen
      currency="TWD"
      expenses={expenses}
      onEditBudget={() => {}}
      onQuickAdd={() => {}}
      onDeleteExpense={() => {}}
      onEditExpense={() => {}}
      viewerMemberId={viewerMemberId}
      tripOwnerMemberId={ANN}
    />,
  );

afterEach(() => cleanup());

describe('the pre-trip spend summary', () => {
  it('separates what you paid from what the trip spent', () => {
    renderWallet(ledger);

    expect(screen.getByText('與你有關的支出')).toBeTruthy();
    expect(screen.getByText('NT$ 13,388')).toBeTruthy();
    expect(screen.getByText('NT$ 12,500')).toBeTruthy();
    expect(screen.getByText('NT$ 888')).toBeTruthy();
  });

  it('answers from the other side too', () => {
    renderWallet(ledger, GINA);

    const split = screen.getByTestId('paid-split');
    expect(split.textContent).toContain('你付的');
    expect(split.textContent).toContain('888');
  });

  it('says nothing about a split when every bill is yours', () => {
    renderWallet(ledger.filter(item => item.payerId === ANN));

    expect(screen.queryByTestId('paid-split')).toBeNull();
    expect(screen.getByText('已支出')).toBeTruthy();
  });

  it('leaves out what she bought for herself, without remarking on it', () => {
    const hers = expense({ id: 'd', amount: 2000, category: Category.SHOPPING, payerId: GINA, beneficiaries: [GINA] });

    renderWallet([...ledger, hers]);

    // 500 + 12000 + 888, and not her 2000.
    expect(screen.getByText('NT$ 13,388')).toBeTruthy();
    // Her own shopping is not a gap in his ledger; it was never in it.
    expect(screen.queryByTestId('others-own-note')).toBeNull();
    expect(document.body.textContent).not.toContain('旅伴自己的支出');
  });
});
