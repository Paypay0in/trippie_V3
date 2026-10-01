/**
 * @vitest-environment jsdom
 *
 * 「這是我剛剛新增的 他沒有出現在最近紀錄 / 其他的 888 Gina 新增的又出現在我這邊」
 *
 * Two faults on one screen, reported together two days before the flight.
 *
 * 最近記錄 was `slice(0, 2)` — the front of the array, the two oldest records,
 * under a heading promising the newest. A 20,000 accommodation bill recorded
 * minutes earlier sat at the end, invisible.
 *
 * And 旅行前支出項目 was built from the whole ledger, so 其他 NT$ 888 — money the
 * second traveller spent on herself — appeared as a category of his own
 * planning, on the very screen that had just been taught to fold her spending
 * away everywhere else.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import WalletPreScreen from '../components/WalletPreScreen';
import { Category, Expense } from '../types';

const ME = 'muo3ht39hl3hpfed:owner';
const HER = 'muoal9czpaxkzw1l';

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.OTHER, date: '2026-09-28', phase: 'pre',
  paymentMethod: 'CASH_TWD', splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

/** The real pre-trip ledger, in the order it is stored: oldest first. */
const ledger = [
  expense({ id: 'e-sim', description: 'Esim', amount: 500, category: Category.SIM_WIFI, date: '2026-09-28', payerId: ME, beneficiaries: [ME] }),
  expense({ id: 'e-air', description: '機票', amount: 12000, category: Category.FLIGHT, date: '2026-09-29', payerId: ME, beneficiaries: [ME, HER] }),
  expense({ id: 'e-888', description: '哈哈', amount: 888, category: Category.OTHER, date: '2026-09-30', payerId: HER, beneficiaries: [HER] }),
  expense({ id: 'e-stay', description: '住宿', amount: 20000, category: Category.ACCOMMODATION, date: '2026-10-01', payerId: ME, beneficiaries: [ME] }),
];

const mount = () => render(
  <WalletPreScreen
    currency="TWD"
    budget={50000}
    expenses={ledger}
    onEditBudget={() => undefined}
    onQuickAdd={() => undefined}
    onDeleteExpense={() => undefined}
    onEditExpense={() => undefined}
    viewerMemberId={ME}
    tripOwnerMemberId={ME}
  />,
);

afterEach(cleanup);

describe('the pre-trip wallet', () => {
  it('shows the bill that was just added under 最近記錄', () => {
    mount();
    const recent = screen.getByText('最近記錄').closest('section') as HTMLElement;
    expect(within(recent).getAllByText('住宿').length).toBeGreaterThan(0);
    // And the two oldest, which used to be all it ever showed, are still there.
    expect(within(recent).getByText('Esim')).toBeTruthy();
  });

  it('keeps her personal spending out of his category list', () => {
    mount();
    // 其他 is her 888 and nothing else of his, so the row must not be there.
    expect(screen.queryByText('其他')).toBeNull();
    // His own categories still are.
    expect(screen.getAllByText('機票').length).toBeGreaterThan(0);
  });

  /**
   * 「旅伴的 888 是他自己的帳 沒有指給我 那就跟我無關！」
   *
   * Her own 888 was inside his headline figure and therefore inside his budget
   * bar. Money nobody has asked him to settle cannot count against a budget he
   * set for himself — but it is still named underneath, so none of it vanishes.
   */
  it('counts only what he has to settle as his own spending', () => {
    mount();
    expect(screen.getAllByText(/NT\$ 32,500/).length).toBeGreaterThan(0);
  });

  it('still names the trip-wide figure, so nothing disappears', () => {
    mount();
    expect(screen.getByTestId('trip-wide-spent').textContent).toContain('33,388');
  });
});
