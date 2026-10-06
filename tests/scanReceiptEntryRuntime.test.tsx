/**
 * @vitest-environment jsdom
 *
 * 「在哪可以用這個功能」 — nowhere, as it turned out.
 *
 * The parser, the itemisation and the translation all worked. The only control
 * that reached them sat inside a `hidden` div on the expense form, and on a
 * batch importer two screens away. A feature with no entry point is a feature
 * nobody has.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Category, Expense } from '../types';

const parsed = {
  description: '貝樂美藥局', merchant: '베러미약국', amount: 107000, currency: 'KRW', category: '購物',
  paymentMethod: '信用卡', date: '2026-10-05',
  items: [
    { name: '블루CPR 4개', translatedName: 'Blue CPR 4入', amount: 120000 },
    { name: '일반의약품 할인', translatedName: '一般醫藥品折扣', amount: -30000 },
  ],
  taxRefundedAtPurchase: true,
  taxRefundActual: 1000,
};

vi.mock('../services/geminiService', () => ({
  parseExpenseWithGemini: vi.fn(async () => null),
  parseImageExpenseWithGemini: vi.fn(async () => parsed),
  fetchCurrentExchangeRate: vi.fn(async () => 0.023),
}));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

const renderForm = (initialData?: Expense) => {
  const onSubmit = vi.fn();
  render(
    <ExpenseForm
      currentPhase="during"
      customCategories={{}}
      onAddCustomCategory={vi.fn()}
      onRemoveCustomCategory={vi.fn()}
      existingExpenses={[]}
      companions={[]}
      onSubmit={onSubmit}
      onClose={vi.fn()}
      initialData={initialData}
    />,
  );
  return { onSubmit };
};

const receipt = () => new File(['x'], 'receipt.jpg', { type: 'image/jpeg' });

describe('photographing a receipt', () => {
  it('is offered on a new expense', () => {
    renderForm();

    expect(screen.getByTestId('scan-receipt').textContent).toContain('拍收據');
  });

  it('opens the camera rather than the photo library', () => {
    // On a phone this is the difference between pointing at the receipt in
    // your hand and hunting for it afterwards.
    renderForm();

    expect(document.querySelector('input[type="file"]')?.getAttribute('capture')).toBe('environment');
  });

  it('records the bill, with the receipt lines on it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, receipt());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const saved = onSubmit.mock.calls[0][0];
    expect(saved.amount).toBe(107000);
    expect(saved.receiptItems).toEqual(parsed.items);
  });

  it('can take a receipt out of the photo library', async () => {
    // 「最好可以上傳收據 相簿中的」 — `capture` is not a hint, it removes the
    // chooser, so a receipt photographed an hour ago could not be used at all.
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    expect(screen.getByTestId('pick-receipt')).toBeTruthy();
    const library = screen.getByTestId('receipt-library-input') as HTMLInputElement;
    expect(library.hasAttribute('capture')).toBe(false);

    await user.upload(library, receipt());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it('names the bill in the reader own language, and keeps the printed name', async () => {
    // 「會代入但不會翻譯」: 광안리 대교밀면 went straight into the title.
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, receipt());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].description).toBe('貝樂美藥局');
    expect(onSubmit.mock.calls[0][0].merchant).toBe('베러미약국');
  });

  it('carries a refund the till already gave back onto the bill', async () => {
    // 「這收據上已經有實際退稅的資訊」 — otherwise the purchase sits in a refund
    // estimate it has already been settled out of.
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, receipt());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].taxRefundedAtPurchase).toBe(true);
    expect(onSubmit.mock.calls[0][0].taxRefundActual).toBe(1000);
  });

  it('is not offered while editing an existing bill', () => {
    // The photo creates the record; offering it here would mean replacing a
    // bill somebody is in the middle of correcting.
    renderForm({
      id: 'e1', description: '藥局', amount: 107000, currency: 'KRW', exchangeRate: 0.023,
      twdAmount: 2461, category: Category.SHOPPING, phase: 'during', date: '2026-10-05',
      payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
    } as Expense);

    expect(screen.queryByTestId('scan-receipt')).toBeNull();
    expect(screen.queryByTestId('pick-receipt')).toBeNull();
  });
});
