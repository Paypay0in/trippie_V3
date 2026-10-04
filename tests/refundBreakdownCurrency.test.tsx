/**
 * @vitest-environment jsdom
 *
 * 「消費是韓幣 我覺得退稅計算要用韓幣 最後才估台幣 不然這樣使用不直覺」.
 *
 * The shop charged 112,800 KRW and handed back 7,000 KRW. Both of those are on
 * paper. The breakdown showed NT$ 2,673 − NT$ 166 = NT$ 2,507, which asks the
 * reader to check a subtraction neither of whose terms they have ever seen.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Category, Expense, PaymentMethod } from '../types';

afterEach(cleanup);

const glasses = (over: Partial<Expense> = {}): Expense => ({
  id: 'e-glasses', description: 'Blue elephant 墨鏡+無框眼鏡', amount: 112800,
  currency: 'KRW', exchangeRate: 0.0237, handlingFee: 0, twdAmount: 2673,
  category: Category.SHOPPING, paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'during', date: '2026-10-03', payerId: 'me', payerAllocations: { me: 112800 },
  beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {}, disputes: [],
  needsReview: false, receiptPhotos: [],
  taxRefundedAtPurchase: true, taxRefundActual: 7000,
  ...over,
}) as Expense;

const openEdit = (expense: Expense) => render(
  <ExpenseForm
    onSubmit={vi.fn()}
    onClose={vi.fn()}
    companions={[]}
    currentPhase="during"
    customCategories={{}}
    initialData={expense}
  />,
);

describe('退稅的計算', () => {
  it('用消費當下的幣別做減法', () => {
    openEdit(glasses());

    const breakdown = within(screen.getByTestId('refund-breakdown'));
    expect(breakdown.getByText('112,800 KRW')).toBeTruthy();
    expect(breakdown.getByText('− 7,000 KRW')).toBeTruthy();
    expect(breakdown.getByText('105,800 KRW')).toBeTruthy();
  });

  it('台幣放在最後，當作換算的結果', () => {
    openEdit(glasses());

    const breakdown = within(screen.getByTestId('refund-breakdown'));
    expect(breakdown.getByText('約計')).toBeTruthy();
    expect(breakdown.getByText(/NT\$ 2,50/)).toBeTruthy();
  });

  it('本來就記台幣的帳，維持原樣', () => {
    // Nothing to convert, and a 「約計」 line under an exact figure would be
    // inventing a distinction that does not exist.
    openEdit(glasses({ currency: 'TWD', exchangeRate: 1, amount: 2673, twdAmount: 2673, taxRefundActual: 166 }));

    const breakdown = within(screen.getByTestId('refund-breakdown'));
    expect(breakdown.getByText('NT$ 2,673')).toBeTruthy();
    expect(breakdown.getByText('− NT$ 166')).toBeTruthy();
    expect(breakdown.queryByText('約計')).toBeNull();
  });
});
