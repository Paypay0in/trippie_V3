/**
 * @vitest-environment jsdom
 *
 * 「記帳頁面中有這個提示的 也要有一個選項可以選：不可退稅」.
 *
 * The hint says a purchase qualifies, worked out from a threshold and a rate.
 * It cannot know the shop was not tax-free registered, or that the 77,000 won
 * was a haircut. Only the person at the counter knows — and until now they had
 * nowhere to say so, so the figure they were about to queue for at the airport
 * counted purchases that were never coming back.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Category, Expense, PaymentMethod, TaxRule } from '../types';

const KOREA = {
  country: '韓國',
  currency: 'KRW',
  refundRate: 0.06,
  minSpend: 15000,
  notes: '單筆消費滿 15,000 韓元。',
} as TaxRule;

const shopping: Expense = {
  id: 'cosmetics',
  description: 'OLIVE YOUNG 美妝保養品',
  amount: 25000,
  currency: 'KRW',
  exchangeRate: 0.0237,
  twdAmount: 593,
  category: Category.SHOPPING,
  paymentMethod: PaymentMethod.CASH_FOREIGN,
  phase: 'during',
  date: '2026-10-05',
  payerId: 'me',
  beneficiaries: ['me'],
  splitMethod: 'EQUAL',
  splitAllocations: {},
};

const renderForm = (onSubmit = vi.fn(), initialData: Expense = shopping) => {
  render(
    <ExpenseForm
      currentPhase="during"
      customCategories={{}}
      onAddCustomCategory={() => {}}
      onRemoveCustomCategory={() => {}}
      existingExpenses={[]}
      companions={[]}
      onSubmit={onSubmit}
      onClose={() => {}}
      initialData={initialData}
      taxRule={KOREA}
      ownerMemberId="me"
      viewerMemberId="me"
    />,
  );
  return onSubmit;
};

afterEach(() => cleanup());

describe('不可退稅', () => {
  it('符合退稅資格的提示旁邊就有這個選項', () => {
    renderForm();
    expect(screen.getByText(/符合 韓國 退稅資格/)).toBeTruthy();
    expect(screen.getByTestId('refund-ineligible')).toBeTruthy();
  });

  it('勾起來之後會記在這筆帳上', () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByTestId('refund-ineligible'));
    fireEvent.click(screen.getByText('儲存變更'));
    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0].taxRefundIneligible).toBe(true);
  });

  it('沒勾就不留記號 —— 沒說過不等於說了可以退', () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByText('儲存變更'));
    expect(onSubmit.mock.calls[0][0].taxRefundIneligible).toBeUndefined();
  });

  it('已經標記過的帳，打開時是勾著的', () => {
    renderForm(vi.fn(), { ...shopping, taxRefundIneligible: true });
    expect((screen.getByTestId('refund-ineligible') as HTMLInputElement).checked).toBe(true);
  });
});
