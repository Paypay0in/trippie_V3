/**
 * @vitest-environment jsdom
 *
 * 「像這筆 發票有顯示退稅金額 沒讀到」.
 *
 * The parser finds 즉시환급 on most Korean receipts and misses some. A miss was
 * final: the breakdown only ever renders a refund that already exists, and
 * nothing on the form could put one in. Saving the edit also replaced the
 * stored bill with what the form carries — so correcting a date threw away the
 * shop, the address and the product lines the photograph had found.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Category, Expense, PaymentMethod } from '../types';

afterEach(cleanup);

const pharmacy = (over: Partial<Expense> = {}): Expense => ({
  id: 'e-drug', description: '藥妝購物', amount: 114000,
  currency: 'KRW', exchangeRate: 0.0225, handlingFee: 0, twdAmount: 2568,
  category: Category.SHOPPING, paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'during', date: '2026-10-05', payerId: 'me', payerAllocations: { me: 114000 },
  beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {}, disputes: [],
  needsReview: false, receiptPhotos: [],
  merchant: '베러미약국',
  merchantAddress: '부산 해운대구 구남로41번길 40',
  receiptItems: [{ name: '블루CPR 4개', translatedName: '藍色CPR 4個', amount: 120000 }],
  ...over,
}) as Expense;

const openEdit = (expense: Expense, onSubmit = vi.fn()) => {
  render(
    <ExpenseForm
      onSubmit={onSubmit}
      onClose={vi.fn()}
      companions={[]}
      currentPhase="during"
      customCategories={{}}
      initialData={expense}
    />,
  );
  return onSubmit;
};

describe('照片沒讀到的退稅金額', () => {
  it('可以自己填進去', async () => {
    const user = userEvent.setup();
    const onSubmit = openEdit(pharmacy());

    await user.click(screen.getByTestId('refunded-at-till'));
    await user.type(screen.getByTestId('refund-amount'), '7000');
    await user.click(screen.getByText('儲存變更'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ taxRefundedAtPurchase: true, taxRefundActual: 7000 }),
      undefined,
    );
  });

  it('填的是收據上的原幣，不是台幣', async () => {
    const user = userEvent.setup();
    openEdit(pharmacy());

    await user.click(screen.getByTestId('refunded-at-till'));

    expect(screen.getByText('退稅金額（KRW）')).toBeTruthy();
  });

  it('本來就有退稅的帳，打開時就帶著那個數字', () => {
    openEdit(pharmacy({ taxRefundedAtPurchase: true, taxRefundActual: 7000 }));

    expect((screen.getByTestId('refund-amount') as HTMLInputElement).value).toBe('7000');
  });

  it('取消勾選就真的沒有退稅，不留一個還在扣錢的數字', async () => {
    const user = userEvent.setup();
    const onSubmit = openEdit(pharmacy({ taxRefundedAtPurchase: true, taxRefundActual: 7000 }));

    await user.click(screen.getByTestId('refunded-at-till'));
    await user.click(screen.getByText('儲存變更'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ taxRefundedAtPurchase: false, taxRefundActual: undefined }),
      undefined,
    );
  });
});

describe('改一筆帳，不會弄丟收據讀到的東西', () => {
  it('商家、地址、商品明細都還在', async () => {
    const user = userEvent.setup();
    const onSubmit = openEdit(pharmacy());

    await user.click(screen.getByText('儲存變更'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant: '베러미약국',
        merchantAddress: '부산 해운대구 구남로41번길 40',
        receiptItems: expect.arrayContaining([expect.objectContaining({ name: '블루CPR 4개' })]),
      }),
      undefined,
    );
  });
});
