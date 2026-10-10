/**
 * @vitest-environment jsdom
 *
 * 「這個分帳建議沒有留言區可以寫留言」.
 *
 * A proposal said 「我想提出以下修正建議。」 every time, whoever sent it and
 * whatever they meant by it. The numbers say what to change; only the sender
 * can say why, and the creator is being asked to approve a change to their own
 * record on trust without it.
 *
 * The type always carried a message — 「A question plus the exact change the
 * creator can accept in one tap」 — the form simply never asked for one.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Category, Expense, PaymentMethod } from '../types';

const bill: Expense = {
  id: 'hotpot',
  description: '火鍋餐點',
  amount: 663,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 663,
  category: Category.FOOD,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'during',
  date: '2026-10-07',
  createdByMemberId: 'gina',
  payerId: 'gina',
  beneficiaries: ['me', 'gina'],
  splitMethod: 'EQUAL',
  splitAllocations: {},
};

const renderForm = (proposalMode: boolean) =>
  render(
    <ExpenseForm
      currentPhase="during"
      customCategories={{}}
      onAddCustomCategory={() => {}}
      onRemoveCustomCategory={() => {}}
      existingExpenses={[bill]}
      companions={[{ id: 'gina', name: 'Gina' }]}
      onSubmit={vi.fn()}
      onClose={() => {}}
      initialData={bill}
      ownerMemberId="me"
      viewerMemberId="me"
      proposalMode={proposalMode}
    />,
  );

afterEach(() => cleanup());

describe('提出修正建議', () => {
  it('有地方可以寫說明', () => {
    renderForm(true);
    expect(screen.getByTestId('proposal-message')).toBeTruthy();
  });

  it('說明是選填的，送出鍵不會因為沒寫就擋住', () => {
    renderForm(true);
    const submit = screen.getByText('送出修正建議').closest('button');
    expect(submit?.hasAttribute('disabled')).toBe(false);
  });

  it('一般記帳沒有這個欄位，它是建議專用的', () => {
    renderForm(false);
    expect(screen.queryByTestId('proposal-message')).toBeNull();
  });
});
