/**
 * @vitest-environment jsdom
 *
 * 「退稅的金額要寫在該項目旁邊 加總的在上面」.
 *
 * The list showed each purchase at what it cost and the refund only as one
 * total above it, so standing in the shop there was no way to tell which of two
 * things was worth carrying to the refund counter.
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

/** Korea, as his card reports it: 15,000 KRW threshold, about 6% back. */
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

const card = (expenses: Expense[]) => {
  const refundState = deriveDuringRefundState({ expenses, travelRules: rules });
  render(<TaxRefundSummaryCard refundState={refundState} onSettleRefund={vi.fn()} />);
  return refundState;
};

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /查看/ }));
};

afterEach(cleanup);

describe('退稅清單', () => {
  /** His purchase: 112,800 KRW of glasses. */
  const glasses = shopping({ id: 'e-glasses', description: 'Blue elephant 墨鏡+無框眼鏡', amount: 112800, twdAmount: 2594 });

  it('每一筆旁邊寫它自己的退稅金額', async () => {
    const user = userEvent.setup();
    card([glasses]);

    await open(user);

    const row = within(screen.getByTestId('refund-row-e-glasses'));
    // 112,800 × 6% = 6,768
    expect(row.getByText('+6,768 KRW')).toBeTruthy();
  });

  it('購買金額還在，但不再是那一列唯一的數字', async () => {
    const user = userEvent.setup();
    card([glasses]);

    await open(user);

    const row = within(screen.getByTestId('refund-row-e-glasses'));
    expect(row.getByText(/112,800 KRW/)).toBeTruthy();
    expect(row.getByText('Blue elephant 墨鏡+無框眼鏡')).toBeTruthy();
  });

  it('每一筆加起來等於上面那個總額', async () => {
    const user = userEvent.setup();
    const second = shopping({ id: 'e-bag', description: '包包', amount: 50000, twdAmount: 1150 });
    const state = card([glasses, second]);

    await open(user);

    const perItem = 'eligibleItems' in state
      ? state.eligibleItems.reduce((sum, item) => sum + (item.refund ?? 0), 0)
      : 0;
    expect(Math.round(perItem)).toBe(Math.round('estimatedRefund' in state ? state.estimatedRefund : -1));
  });

  it('以退稅幣別計算，不是用原幣直接乘', async () => {
    // Recorded in TWD: 2,300 TWD ÷ 0.023 = 100,000 KRW, so 6,000 KRW back.
    const inTwd = shopping({ id: 'e-twd', description: '免稅店', amount: 2300, twdAmount: 2300, currency: 'TWD' });
    const user = userEvent.setup();
    card([glasses, inTwd]);

    await open(user);

    expect(within(screen.getByTestId('refund-row-e-twd')).getByText('+6,000 KRW')).toBeTruthy();
  });
});

describe('還沒達到門檻的購物', () => {
  it('寫出還差多少，而不是寫一個拿不到的退稅金額', async () => {
    const user = userEvent.setup();
    card([shopping({ id: 'e-small', description: '便利商店', amount: 9000, twdAmount: 207 })]);

    await open(user);

    const row = within(screen.getByTestId('refund-row-e-small'));
    expect(row.getByText(/還差 6,000/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('+540');
  });
});
