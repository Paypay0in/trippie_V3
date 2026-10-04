/**
 * @vitest-environment jsdom
 *
 * 「這個欄位不能輸入」.
 *
 * The 備註（選填） box was on the form, `disabled`, with no value, no handler and
 * no column behind it. The label had been promising something the form could
 * not do, and 「這筆是跟 Gina 平分的那頓」 had nowhere to go.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import ExpenseList from '../components/ExpenseList';
import { Category, Expense, PaymentMethod } from '../types';

afterEach(cleanup);

const dinner = (over: Partial<Expense> = {}): Expense => ({
  id: 'e-dinner', description: '釜飯', amount: 40000, currency: 'KRW', exchangeRate: 0.0237,
  handlingFee: 0, twdAmount: 948, category: Category.FOOD, paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'during', date: '2026-10-04', payerId: 'me', payerAllocations: { me: 40000 },
  beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {}, disputes: [],
  needsReview: false, receiptPhotos: [],
  ...over,
}) as Expense;

const openForm = (initialData?: Expense) => {
  const onSubmit = vi.fn();
  render(
    <ExpenseForm
      onSubmit={onSubmit}
      onClose={vi.fn()}
      companions={[]}
      currentPhase="during"
      customCategories={{}}
      {...(initialData ? { initialData } : {})}
    />,
  );
  return { onSubmit };
};

describe('備註 on an expense', () => {
  it('can be typed into', async () => {
    const user = userEvent.setup();
    openForm(dinner());

    await user.type(screen.getByTestId('expense-note'), '跟 Gina 平分的那頓');

    expect((screen.getByTestId('expense-note') as HTMLTextAreaElement).value).toBe('跟 Gina 平分的那頓');
  });

  it('is saved with the expense', async () => {
    const user = userEvent.setup();
    const { onSubmit } = openForm(dinner());

    await user.type(screen.getByTestId('expense-note'), '收據在背包側袋');
    await user.click(screen.getByText(/儲存變更/));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ note: '收據在背包側袋' }),
      undefined,
    );
  });

  it('comes back when the expense is reopened', () => {
    openForm(dinner({ note: '收據在背包側袋' }));

    expect((screen.getByTestId('expense-note') as HTMLTextAreaElement).value).toBe('收據在背包側袋');
  });

  it('is not stored as whitespace', async () => {
    // An empty note and a note made of spaces are the same thing, and only one
    // of them renders as a blank line under the bill.
    const user = userEvent.setup();
    const { onSubmit } = openForm(dinner());

    await user.type(screen.getByTestId('expense-note'), '   ');
    await user.click(screen.getByText(/儲存變更/));

    expect(onSubmit.mock.calls[0][0].note).toBeUndefined();
  });
});

describe('備註 on the ledger row', () => {
  it('reads on the row, not only inside the edit sheet', () => {
    // A note nobody can see is a note nobody writes a second time.
    render(
      <ExpenseList
        expenses={[dinner({ note: '收據在背包側袋' })]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('expense-note-e-dinner').textContent).toBe('收據在背包側袋');
  });

  it('shows nothing when there is no note', () => {
    render(<ExpenseList expenses={[dinner()]} onDelete={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.queryByTestId('expense-note-e-dinner')).toBeNull();
  });
});

describe('備註 across two phones', () => {
  it('travels with the expense', async () => {
    // Both travellers read the same ledger: a note explaining a bill belongs on
    // the bill, not on whichever phone typed it.
    const { toExpenseRow, fromExpenseRow } = await import('../services/tripSyncMapping');

    const row = toExpenseRow(dinner({ note: '收據在背包側袋' }), 'trip-1');

    expect(row.note).toBe('收據在背包側袋');
    expect(fromExpenseRow(row as never).note).toBe('收據在背包側袋');
  });

  it('reads a row written before the column existed', async () => {
    const { fromExpenseRow } = await import('../services/tripSyncMapping');

    expect(fromExpenseRow({} as never).note).toBeUndefined();
    expect(fromExpenseRow({ note: '   ' } as never).note).toBeUndefined();
  });
});
