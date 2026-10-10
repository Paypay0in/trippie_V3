/**
 * @vitest-environment jsdom
 *
 * 「預算填寫是可選項 那用戶如果沒有填 這邊就不要顯示」.
 *
 * The budget is optional on the form and was compulsory in the summary. Two
 * cards appeared whether or not anybody had set one: 旅行總預算 reading 尚未設定
 * above a button, and 剩餘預算 reading a dash. Between them they took the top
 * third of the overview to report the absence of something the traveller had
 * already declined, and pushed what they actually spent below the fold.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WalletPreScreen from '../components/WalletPreScreen';
import { Category, PaymentMethod } from '../types';
import type { Expense } from '../types';

const OWNER = 'trip:owner';

const bill = (fields: Partial<Expense> = {}): Expense => ({
  id: 'e-1',
  description: '機票',
  amount: 16016,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 16016,
  category: Category.FLIGHT,
  paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'pre',
  date: '2026-10-02',
  payerId: OWNER,
  beneficiaries: [OWNER],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...fields,
});

const renderWallet = (budget?: number) =>
  render(
    <WalletPreScreen
      currency="TWD"
      budget={budget}
      expenses={[bill()]}
      onEditBudget={() => {}}
      onQuickAdd={() => {}}
      onDeleteExpense={() => {}}
      onEditExpense={() => {}}
      viewerMemberId={OWNER}
      tripOwnerMemberId={OWNER}
    />,
  );

afterEach(cleanup);

describe('沒設預算的時候', () => {
  it('不出現「旅行總預算」那張卡', () => {
    renderWallet(undefined);
    expect(screen.queryByText('旅行總預算')).toBeNull();
    expect(screen.queryByText('尚未設定')).toBeNull();
  });

  it('不出現「設定預算」按鈕', () => {
    renderWallet(undefined);
    expect(screen.queryByRole('button', { name: '設定預算' })).toBeNull();
  });

  it('不出現「剩餘預算」那格破折號', () => {
    renderWallet(undefined);
    expect(screen.queryByTestId('budget-remaining')).toBeNull();
  });

  /** The thing the screen is actually for still has to be there. */
  it('實際支出照樣在', () => {
    renderWallet(undefined);
    expect(screen.getByText('你的實際支出')).toBeTruthy();
    expect(screen.getByText('NT$ 16,016')).toBeTruthy();
  });
});

describe('設了預算的時候', () => {
  it('兩張卡都回來', () => {
    renderWallet(50000);
    expect(screen.getByText('旅行總預算')).toBeTruthy();
    expect(screen.getByText('NT$ 50,000')).toBeTruthy();
    expect(screen.getByTestId('budget-remaining')).toBeTruthy();
  });

  it('剩餘預算算得出來', () => {
    renderWallet(50000);
    expect(screen.getByTestId('budget-remaining').textContent).toContain('33,984');
  });

  /** Zero is a budget somebody chose, not a blank. */
  it('預算填 0 也算有設', () => {
    renderWallet(0);
    expect(screen.getByText('旅行總預算')).toBeTruthy();
  });
});
