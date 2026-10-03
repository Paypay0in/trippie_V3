/**
 * @vitest-environment jsdom
 *
 * 「要加一個按鈕：不可退稅」.
 *
 * Every shopping purchase over the threshold was counted towards the estimate,
 * whatever it was and wherever it came from. A shop that is not tax-free
 * registered puts money into a headline somebody is about to queue for.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import TaxRefundSummaryCard from '../components/TaxRefundSummaryCard';
import { deriveDuringRefundState } from '../services/duringRefundState';
import { Category, Expense, TravelRules } from '../types';

const shopping = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'KRW', exchangeRate: 0.023,
  category: Category.SHOPPING, phase: 'during', date: '2026-10-02',
  payerId: 'me', beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

const rules = {
  taxRefund: {
    numericCalculationAvailable: true,
    numericRuleSource: 'model_knowledge',
    numericRule: {
      currency: 'KRW',
      minSpend: 15000,
      thresholdScope: 'per_transaction',
      refundMethod: { type: 'rate', rate: 0.06 },
    },
  },
} as unknown as TravelRules;

const bird = shopping({ id: 'e-bird', description: '涼草小鳥', amount: 17500, twdAmount: 403 });
const case_ = shopping({ id: 'e-case', description: '耳機殼+手機殼', amount: 30800, twdAmount: 708 });

const card = (expenses: Expense[]) => {
  const onToggleRefundIneligible = vi.fn();
  render(
    <TaxRefundSummaryCard
      refundState={deriveDuringRefundState({ expenses, travelRules: rules })}
      onSettleRefund={vi.fn()}
      onToggleRefundIneligible={onToggleRefundIneligible}
    />,
  );
  return { onToggleRefundIneligible };
};

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /查看/ }));
};

afterEach(cleanup);

describe('不可退稅', () => {
  it('每一筆旁邊都有這個按鈕', async () => {
    const user = userEvent.setup();
    card([bird, case_]);
    await open(user);

    expect(within(screen.getByTestId('refund-row-e-bird')).getByText('不可退稅')).toBeTruthy();
    expect(within(screen.getByTestId('refund-row-e-case')).getByText('不可退稅')).toBeTruthy();
  });

  it('按下去回報這一筆，不是全部', async () => {
    const user = userEvent.setup();
    const { onToggleRefundIneligible } = card([bird, case_]);
    await open(user);

    await user.click(screen.getByTestId('mark-ineligible-e-bird'));

    expect(onToggleRefundIneligible).toHaveBeenCalledWith('e-bird', true);
  });

  it('標記後那一筆從估算裡消失', async () => {
    const user = userEvent.setup();
    card([bird, { ...case_, taxRefundIneligible: true } as Expense]);
    await open(user);

    // 17,500 × 6% = 1,050，耳機殼那筆不算進去
    expect(screen.getByText('1,050 KRW')).toBeTruthy();
    expect(screen.queryByTestId('refund-row-e-case')).toBeNull();
  });

  it('標記後還看得到，而且可以取消', async () => {
    const user = userEvent.setup();
    const { onToggleRefundIneligible } = card([bird, { ...case_, taxRefundIneligible: true } as Expense]);

    const listed = within(screen.getByTestId('refund-ineligible'));
    expect(listed.getByText('耳機殼+手機殼')).toBeTruthy();

    await user.click(screen.getByTestId('unmark-ineligible-e-case'));
    expect(onToggleRefundIneligible).toHaveBeenCalledWith('e-case', false);
  });

  it('說清楚這些不列入上方估算', () => {
    card([bird, { ...case_, taxRefundIneligible: true } as Expense]);

    expect(screen.getByText(/不可退稅 · 1 筆（不列入上方估算）/)).toBeTruthy();
  });

  it('沒有提供這個動作時不顯示按鈕', async () => {
    const user = userEvent.setup();
    render(
      <TaxRefundSummaryCard
        refundState={deriveDuringRefundState({ expenses: [bird], travelRules: rules })}
        onSettleRefund={vi.fn()}
      />,
    );
    await open(user);

    expect(screen.queryByTestId('mark-ineligible-e-bird')).toBeNull();
  });
});
