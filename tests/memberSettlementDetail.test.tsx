/**
 * @vitest-environment jsdom
 *
 * 成員結算明細, built to the design the Founder sent:
 * 「除了劃紅線區塊消除，其他請 100% 依這個介面設計還原分帳明細頁面」.
 *
 * Two travellers reading two mirror-image screens can disagree about who owes
 * whom. One table naming every member, with the bills that produced it
 * underneath, cannot — so this asserts the three things the design promises:
 * each member's side and amount, the payments that close it, and每 bill read as
 * 「X 先付・Y 和 Z 應付・各 N」.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import MemberSettlementDetail from '../components/MemberSettlementDetail';
import { buildMemberPositions, describeExpense, settlementExpenses } from '../services/memberSettlementDetail';
import { Category, Expense, TripMember } from '../types';

const GINA = 'seat-gina';
const ANN = 'trip:owner';
const BRIAN = 'seat-brian';

const members: TripMember[] = [
  { id: GINA, name: 'Gina', type: 'guest' },
  { id: ANN, name: 'Ann', type: 'owner' },
  { id: BRIAN, name: 'Brian', type: 'guest' },
];

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.OTHER, phase: 'during', date: '2026-10-01',
  payerId: ANN, beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

/** The ledger from the design: five bills across three travellers. */
const ledger = [
  bill({ id: 'e-air', category: Category.FLIGHT, description: '台北 → 釜山', date: '2026-10-01', amount: 12500, twdAmount: 12500, payerId: GINA, beneficiaries: [ANN, BRIAN] }),
  bill({ id: 'e-stay', category: Category.ACCOMMODATION, description: '釜山海雲台飯店（2晚）', date: '2026-10-01', amount: 8000, twdAmount: 8000, payerId: ANN, beneficiaries: [GINA, BRIAN] }),
  bill({ id: 'e-pork', category: Category.FOOD, description: '豬肉湯飯', date: '2026-10-02', amount: 888, twdAmount: 888, payerId: BRIAN, beneficiaries: [GINA, ANN] }),
  bill({ id: 'e-noodle', category: Category.FOOD, description: '大師兄牛肉麵', date: '2026-10-03', amount: 726, twdAmount: 726, payerId: GINA, beneficiaries: [ANN, BRIAN] }),
  bill({ id: 'e-car', category: Category.TRANSPORT, description: '包車一日遊', date: '2026-10-04', amount: 3200, twdAmount: 3200, payerId: ANN, beneficiaries: [GINA, BRIAN] }),
];

const page = (props: Record<string, unknown> = {}) =>
  render(
    <MemberSettlementDetail
      tripName="釜山之旅"
      dateRange="2026/10/01 - 2026/10/05"
      expenses={ledger}
      members={members}
      ownerMemberId={ANN}
      {...(props as never)}
    />,
  );

afterEach(cleanup);

describe('每個人的位置', () => {
  it('每筆帳的付出與分攤相抵，總和必須歸零', () => {
    const total = buildMemberPositions(ledger, members, ANN).reduce((sum, row) => sum + row.net, 0);

    expect(Math.round(total)).toBe(0);
  });

  it('先付又不分攤的人是應收方', () => {
    // Gina fronted 12,500 and 726 and shares neither; she consumes 4,000 of
    // the hotel and 1,600 of the car and 444 of the pork soup.
    const gina = buildMemberPositions(ledger, members, ANN).find(row => row.member.id === GINA);

    expect(gina?.net).toBe(12500 + 726 - 4000 - 1600 - 444);
  });

  it('畫面上標出應收與應付，以及付給誰', () => {
    page();

    const gina = within(screen.getByTestId(`member-${GINA}`));
    expect(gina.getByText('應收')).toBeTruthy();
    expect(gina.getByText('Gina')).toBeTruthy();

    const brian = within(screen.getByTestId(`member-${BRIAN}`));
    expect(brian.getByText('應付')).toBeTruthy();
    // Brian owes two people, so the card carries a line for each.
    expect(brian.getAllByText(/付給/).length).toBeGreaterThan(0);
  });
});

describe('每一筆支出', () => {
  it('讀成「誰先付・誰應付・各多少」', () => {
    const flights = describeExpense(ledger[0], members, ANN);

    expect(flights.payer?.name).toBe('Gina');
    expect(flights.owedBy.map(member => member.name)).toEqual(['Ann', 'Brian']);
    expect(flights.perHead).toBe(6250);
  });

  it('付款人不列進應付名單，兩人分帳不會讀成三人', () => {
    const sharedWithPayer = bill({ id: 'e-two', amount: 1000, twdAmount: 1000, payerId: ANN, beneficiaries: [ANN, GINA] });

    const described = describeExpense(sharedWithPayer, members, ANN);

    expect(described.owedBy.map(member => member.name)).toEqual(['Gina']);
    expect(described.perHead).toBe(500);
  });

  it('畫面逐筆顯示金額、應付的人與每人分攤', () => {
    page();

    const row = within(screen.getByTestId('expense-e-air'));
    expect(row.getByText('台北 → 釜山')).toBeTruthy();
    expect(row.getByText(/Gina 先付/)).toBeTruthy();
    expect(row.getByText('NT$ 12,500')).toBeTruthy();
    expect(row.getByText('Ann、Brian 應付')).toBeTruthy();
    expect(row.getByText('各 NT$ 6,250')).toBeTruthy();
  });

  it('點一筆支出會把它交給呼叫端處理', async () => {
    const onOpenExpense = vi.fn();
    const user = userEvent.setup();
    page({ onOpenExpense });

    await user.click(screen.getByTestId('expense-e-noodle'));

    expect(onOpenExpense).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-noodle' }));
  });
});

describe('這趟旅程本身', () => {
  it('標題與日期跟著畫面走，截圖出去也看得懂是哪一趟', () => {
    page();

    expect(screen.getByText('釜山之旅')).toBeTruthy();
    expect(screen.getByText('2026/10/01 - 2026/10/05')).toBeTruthy();
    expect(screen.getByText('成員結算明細')).toBeTruthy();
  });

  it('沒有支出時說出來，而不是留一塊空白', () => {
    page({ expenses: [] });

    expect(screen.getByText('這趟還沒有需要分攤的支出')).toBeTruthy();
  });
});

/**
 * 「這個支出沒有分帳的問題 是對方個人的支出 就不應出現在分帳結算表格」.
 *
 * Gina's own NT$ 888 sat in 相關支出 on a page about who owes whom, labelled
 * 「自己的支出」 — the one honest thing it could say, and the proof it did not
 * belong there. It settles nothing and moves no money between anybody.
 */
describe('自己付給自己的帳', () => {
  // Stored the way his really is: Gina paid it and Gina is the only one on it.
  const ownBill = bill({ id: 'e-own', description: '哈哈❤️', date: '2026-10-03', amount: 888, twdAmount: 888, payerId: GINA, beneficiaries: [GINA] });
  // The rarer shape: nobody on it at all.
  const nobodysBill = bill({ id: 'e-nobody', description: '自己的咖啡', date: '2026-10-03', amount: 120, twdAmount: 120, payerId: GINA, beneficiaries: [] });

  it('不列進分帳結算表格', () => {
    expect(settlementExpenses([...ledger, ownBill], members, ANN).map(expense => expense.id))
      .toEqual(ledger.map(expense => expense.id));
  });

  it('畫面上也看不到它', () => {
    page({ expenses: [...ledger, ownBill] });

    expect(screen.queryByTestId('expense-e-own')).toBeNull();
    expect(document.body.textContent).not.toContain('自己的支出');
  });

  it('但它不會改變任何人的結算金額——自己付自己的，淨額是零', () => {
    const withOwn = buildMemberPositions([...ledger, ownBill], members, ANN);
    const without = buildMemberPositions(ledger, members, ANN);

    expect(withOwn.map(row => row.net)).toEqual(without.map(row => row.net));
  });

  it('連分攤者都沒有的帳也一樣，不會讓付款人變成應收', () => {
    const withNobody = buildMemberPositions([...ledger, nobodysBill], members, ANN);

    expect(withNobody.map(row => row.net)).toEqual(buildMemberPositions(ledger, members, ANN).map(row => row.net));
    expect(Math.round(withNobody.reduce((sum, row) => sum + row.net, 0))).toBe(0);
    expect(settlementExpenses([...ledger, nobodysBill], members, ANN).map(expense => expense.id))
      .toEqual(ledger.map(expense => expense.id));
  });

  it('整趟都沒有分帳時，說出來而不是留一塊空白', () => {
    page({ expenses: [ownBill] });

    expect(screen.getByText('這趟還沒有需要分攤的支出')).toBeTruthy();
  });
});
