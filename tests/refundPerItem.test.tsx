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

/**
 * 「我的介面 這裡出現 Gina 的退稅明細 他自己的帳不應出現在我這」.
 *
 * The fourth screen this week to show one traveller the other's money. The
 * refund list read every shopping expense on the trip, so her sunglasses sat
 * in his estimate and in his total.
 *
 * A refund belongs to whoever paid, not to whoever shares the cost: the receipt
 * is in their name and it is their passport at the counter. A bill she paid and
 * split with him is still hers to claim — which is the one case a 「我分攤了就
 * 算我的」 rule would get wrong.
 */
describe('退稅是誰的', () => {
  const ME = 'trip:owner';
  const GINA = 'seat-gina';

  const mine = shopping({ id: 'e-mine', description: 'Blue elephant 墨鏡', amount: 112800, twdAmount: 2594, payerId: ME });
  const hers = shopping({ id: 'e-hers', description: '太陽眼鏡', amount: 99800, twdAmount: 2295, payerId: GINA });
  /** She paid, he shares half — still her receipt. */
  const sharedButHers = shopping({
    id: 'e-shared', description: '伴手禮', amount: 60000, twdAmount: 1380,
    payerId: GINA, beneficiaries: [GINA, ME],
  });

  const stateFor = (viewer?: string) =>
    deriveDuringRefundState({
      expenses: [mine, hers, sharedButHers],
      travelRules: rules,
      viewerMemberId: viewer,
      tripOwnerMemberId: ME,
    });

  it('我的畫面只算我付的那筆', () => {
    const state = stateFor(ME);

    expect('eligibleItems' in state ? state.eligibleItems.map(item => item.expense.id) : [])
      .toEqual(['e-mine']);
  });

  it('她付的、就算分我一半，退稅仍然是她的', () => {
    const state = stateFor(ME);

    expect(document.body.textContent).not.toContain('太陽眼鏡');
    expect('eligibleItems' in state ? state.eligibleItems.map(item => item.expense.id) : [])
      .not.toContain('e-shared');
  });

  it('她的畫面算的是她付的兩筆', () => {
    const state = stateFor(GINA);

    expect('eligibleItems' in state ? state.eligibleItems.map(item => item.expense.id) : [])
      .toEqual(['e-hers', 'e-shared']);
  });

  it('總額跟著縮到只剩我自己的', () => {
    const state = stateFor(ME);

    // 112,800 × 6% = 6,768 — not the 12,756 that counted hers too.
    expect(Math.floor('estimatedRefund' in state ? state.estimatedRefund : 0)).toBe(6768);
  });

  it('沒有指定讀的人時照舊算全部——單人帳本每一筆都是他的', () => {
    const state = stateFor(undefined);

    expect('eligibleItems' in state ? state.eligibleItems.length : 0).toBe(3);
  });
});

/**
 * 「我發現，退稅有些店家是直接可以在購物結帳時扣除，所以要讓我每筆都點選已經扣除」.
 *
 * Korea calls it 즉시환급: under certain limits the shop takes the tax off at
 * the till and the traveller walks out with it already settled. Counting those
 * again inflates the figure somebody is about to stand in an airport queue for.
 */
describe('結帳時就退掉的那些', () => {
  const claimable = shopping({ id: 'e-claim', description: '墨鏡', amount: 112800, twdAmount: 2594 });
  const atTill = shopping({ id: 'e-till', description: '藥妝', amount: 60000, twdAmount: 1380, taxRefundedAtPurchase: true });

  const state = () => deriveDuringRefundState({ expenses: [claimable, atTill], travelRules: rules });

  it('不列入機場要退的估算', () => {
    const current = state();

    expect('eligibleItems' in current ? current.eligibleItems.map(item => item.expense.id) : [])
      .toEqual(['e-claim']);
    // 112,800 × 6% only — not the 10,368 that counted the pharmacy too.
    expect(Math.floor('estimatedRefund' in current ? current.estimatedRefund : 0)).toBe(6768);
  });

  it('還是會被列出來，不是打完勾就消失', () => {
    const current = state();

    expect('settledItems' in current ? current.settledItems.map(item => item.expense.id) : [])
      .toEqual(['e-till']);
  });

  it('畫面上分開放，而且標明不列入估算', async () => {
    const user = userEvent.setup();
    render(
      <TaxRefundSummaryCard
        refundState={state()}
        onSettleRefund={vi.fn()}
        onToggleRefundedAtPurchase={vi.fn()}
      />,
    );

    await open(user);

    expect(screen.getByTestId('settled-row-e-till')).toBeTruthy();
    expect(screen.getByTestId('settled-at-purchase').textContent).toContain('不列入上方估算');
  });

  it('每一筆都可以點選標記', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TaxRefundSummaryCard
        refundState={state()}
        onSettleRefund={vi.fn()}
        onToggleRefundedAtPurchase={onToggle}
      />,
    );

    await open(user);
    await user.click(screen.getByTestId('mark-refunded-e-claim'));

    expect(onToggle).toHaveBeenCalledWith('e-claim', true);
  });

  it('標錯了可以取消，一下就好', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TaxRefundSummaryCard
        refundState={state()}
        onSettleRefund={vi.fn()}
        onToggleRefundedAtPurchase={onToggle}
      />,
    );

    await open(user);
    await user.click(screen.getByTestId('unmark-refunded-e-till'));

    expect(onToggle).toHaveBeenCalledWith('e-till', false);
  });

  it('沒有提供標記功能時，清單仍然讀得到', async () => {
    const user = userEvent.setup();
    render(<TaxRefundSummaryCard refundState={state()} onSettleRefund={vi.fn()} />);

    await open(user);

    expect(screen.queryByTestId('mark-refunded-e-claim')).toBeNull();
    expect(screen.getByTestId('refund-row-e-claim')).toBeTruthy();
  });
});
