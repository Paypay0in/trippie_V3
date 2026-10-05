/**
 * @vitest-environment jsdom
 *
 * 「這個符合退稅資格但沒有顯示」 — 藥局：唇膏與唇炎膏, NT$569, filed under
 * 保養美妝品: a category the traveller made themselves, and therefore invisible
 * to a refund rule that knows only the built-in buckets.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import TaxRefundSummaryCard from '../components/TaxRefundSummaryCard';
import { deriveDuringRefundState } from '../services/duringRefundState';
import { Category, Expense, TravelRules } from '../types';

afterEach(cleanup);

const rules = {
  taxRefund: {
    numericCalculationAvailable: true,
    numericRuleSource: 'model_knowledge',
    numericRule: {
      currency: 'KRW', minSpend: 15000, thresholdScope: 'per_transaction',
      refundMethod: { type: 'rate', rate: 0.06 },
    },
    guidance: '在貼有 TAX FREE 標示的店家消費滿 15,000 韓元可退稅。',
  },
} as unknown as TravelRules;

const lipstick = {
  id: 'e-lip', description: '藥局：唇膏與唇炎膏', amount: 25000, twdAmount: 569,
  currency: 'KRW', exchangeRate: 0.023, category: '保養美妝品' as Category,
  phase: 'during', date: '2026-10-05',
  payerId: 'me', beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
} as Expense;

const renderForm = (decided: Record<string, boolean>) => {
  const onDecideCustomCategory = vi.fn();
  render(
    <ExpenseForm
      currentPhase="during"
      customCategories={{ during: ['保養美妝品'] }}
      refundableCustomCategories={decided}
      onDecideCustomCategory={onDecideCustomCategory}
      onAddCustomCategory={vi.fn()}
      onRemoveCustomCategory={vi.fn()}
      existingExpenses={[]}
      companions={[]}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      initialData={lipstick}
      taxRule={{ currency: 'KRW', refundRate: 0.06, minSpend: 15000 } as never}
      travelRules={rules}
    />,
  );
  return { onDecideCustomCategory };
};

describe('a bill in a category the traveller invented', () => {
  it('asks once whether that category holds goods', () => {
    renderForm({});

    expect(screen.getByTestId('ask-category-refundable').textContent).toContain('保養美妝品');
  });

  it('remembers the answer against the category, not the bill', async () => {
    const user = userEvent.setup();
    const { onDecideCustomCategory } = renderForm({});

    await user.click(screen.getByTestId('category-refundable-yes'));

    expect(onDecideCustomCategory).toHaveBeenCalledWith('保養美妝品', true);
  });

  it('stops asking once it has been answered, either way', () => {
    renderForm({ 保養美妝品: true });
    expect(screen.queryByTestId('ask-category-refundable')).toBeNull();

    cleanup();

    renderForm({ 保養美妝品: false });
    expect(screen.queryByTestId('ask-category-refundable')).toBeNull();
  });
});

describe('the refund card', () => {
  const card = (decided: Record<string, boolean>) => {
    const refundState = deriveDuringRefundState({
      expenses: [lipstick], travelRules: rules, customDecisions: decided,
    });
    render(<TaxRefundSummaryCard refundState={refundState} onSettleRefund={vi.fn()} />);
    return refundState;
  };

  it('counts the purchase once the category is marked as goods', () => {
    const state = card({ 保養美妝品: true });

    expect('eligibleExpenses' in state ? state.eligibleExpenses.map(entry => entry.id) : []).toEqual(['e-lip']);
  });

  it('leaves it out while the category is unanswered', () => {
    // Silence is the honest answer here: nothing knows whether 保養美妝品 holds
    // lipstick or massages.
    const state = card({});

    expect('eligibleExpenses' in state ? state.eligibleExpenses : []).toEqual([]);
  });

  it('leaves it out when the category was answered no', () => {
    const state = card({ 保養美妝品: false });

    expect('eligibleExpenses' in state ? state.eligibleExpenses : []).toEqual([]);
  });
});
