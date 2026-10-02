/**
 * @vitest-environment jsdom
 *
 * 「剛剛點開還是沒有退稅資訊」.
 *
 * The lookup had the Korean rule — 單筆滿 15,000 韓元, roughly 6% back after
 * fees — and the card never said either number. It reported a status only, so
 * a traveller the day before flying, with nothing bought yet, was told 「尚未達
 * 退稅門檻」 and left to guess which threshold and what proportion.
 *
 * The threshold and the rate are the part you need standing in the shop.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TaxRefundSummaryCard from '../components/TaxRefundSummaryCard';
import { deriveDuringRefundState } from '../services/duringRefundState';
import { Category, Expense, TravelRules } from '../types';

/** Korea, exactly as the live lookup answers it. */
const koreaRules = {
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

const shopping = (amount: number): Expense => ({
  id: `e-${amount}`, description: '化妝品', amount, twdAmount: amount / 40,
  currency: 'KRW', exchangeRate: 0.025, category: Category.SHOPPING, phase: 'during',
  date: '2026-10-03', payerId: 'trip:owner', beneficiaries: ['trip:owner'],
  splitMethod: 'EQUAL', splitAllocations: {},
} as unknown as Expense);

const card = (expenses: Expense[]) =>
  render(
    <TaxRefundSummaryCard
      refundState={deriveDuringRefundState({ expenses, travelRules: koreaRules })}
      onSettleRefund={() => undefined}
    />,
  );

afterEach(cleanup);

describe('the tax refund card', () => {
  it('states the threshold and the rate before anything is bought', () => {
    card([]);

    expect(screen.getByTestId('refund-rule').textContent).toContain('15,000 KRW');
    expect(screen.getByTestId('refund-rule').textContent).toContain('6%');
  });

  it('keeps saying them once a qualifying purchase exists', () => {
    card([shopping(30000)]);

    expect(screen.getByTestId('refund-rule').textContent).toContain('15,000 KRW');
    // And now there is a figure as well.
    expect(screen.getByText(/1,800 KRW/)).toBeTruthy();
  });

  it('says nothing it does not know when there is no rule at all', () => {
    render(
      <TaxRefundSummaryCard
        refundState={deriveDuringRefundState({ expenses: [], travelRules: undefined })}
        onSettleRefund={() => undefined}
      />,
    );

    expect(screen.queryByTestId('refund-rule')).toBeNull();
    expect(screen.getByText('目前無法安全估算退稅金額。')).toBeTruthy();
  });
});
