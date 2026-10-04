/**
 * @vitest-environment jsdom
 *
 * 「將帳目的這個介面 100% 改成我圖上的樣子」.
 *
 * His design asks each row to answer three things at a glance: what the bill
 * was, who fronted it, and whether it is anything to do with you. The list it
 * replaces showed a category glyph and a payment-method chip, neither of which
 * is in question while you are scanning for a bill you remember by its photo,
 * and it ended every row with a pencil, a bin and 提出疑問 spelled out.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import ExpenseList from '../components/ExpenseList';
import { Category, Expense, TripMember } from '../types';

const ME = 'trip:owner';
const GINA = 'seat-gina';

const members: TripMember[] = [
  { id: ME, name: 'Ann', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
];

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD',
  category: Category.OTHER, date: '2026-10-02', phase: 'during',
  splitMethod: 'EQUAL', splitAllocations: {}, beneficiaries: [],
  ...over,
} as Expense);

/** The rows on his mockup. */
const noodles = expense({
  id: 'e-noodle', description: '大師兄牛肉麵', category: Category.FOOD,
  amount: 726, twdAmount: 726, payerId: GINA, beneficiaries: [GINA, ME],
});
const coffee = expense({
  id: 'e-coffee', description: '星巴克咖啡', amount: 150, twdAmount: 150,
  payerId: ME, beneficiaries: [ME],
});

const list = (expenses: Expense[], props: Record<string, unknown> = {}) => render(
  <ExpenseList
    expenses={expenses}
    onDelete={vi.fn()}
    onEdit={vi.fn()}
    viewerMemberId={ME}
    tripOwnerMemberId={ME}
    members={members}
    {...props}
  />,
);

afterEach(cleanup);

describe('一筆分帳的帳目', () => {
  it('說出誰先付的', () => {
    list([noodles]);

    expect(within(screen.getByTestId('expense-row-e-noodle')).getByText('Gina 先付')).toBeTruthy();
  });

  it('金額用 TWD，並且仍然說出你實際分攤多少', () => {
    list([noodles]);
    const row = within(screen.getByTestId('expense-row-e-noodle'));

    expect(row.getByText('TWD 726')).toBeTruthy();
    expect(row.getByText('分帳・你 $363')).toBeTruthy();
  });

  it('帶出參與者的頭像', () => {
    list([noodles]);
    const row = within(screen.getByTestId('expense-row-e-noodle'));

    expect(row.getByText('G')).toBeTruthy();
    expect(row.getByText('A')).toBeTruthy();
  });

  it('你自己付的帳寫「你 先付」，不是你的名字', () => {
    list([expense({ ...noodles, id: 'e-mine', payerId: ME, beneficiaries: [ME, GINA] })]);

    expect(within(screen.getByTestId('expense-row-e-mine')).getByText('你 先付')).toBeTruthy();
  });
});

describe('一筆自己的帳目', () => {
  it('標成個人支出、我自己付・不分帳', () => {
    list([coffee]);
    const row = within(screen.getByTestId('expense-row-e-coffee'));

    expect(row.getByText('個人支出')).toBeTruthy();
    expect(row.getByText('我自己付・不分帳')).toBeTruthy();
  });

  it('不會出現分帳金額', () => {
    list([coffee]);

    expect(document.body.textContent).not.toContain('分帳・你');
  });

  it('整列用綠色標出來，和分帳的帳目分得開', () => {
    list([coffee]);

    expect(screen.getByTestId('expense-row-e-coffee').className).toContain('emerald');
  });
});

describe('一列的操作', () => {
  it('右邊是一個箭頭，不是三顆按鈕', () => {
    list([noodles]);
    const row = within(screen.getByTestId('expense-row-e-noodle'));

    expect(row.getByTestId('expense-open-e-noodle')).toBeTruthy();
    expect(row.queryByTitle('刪除支出')).toBeNull();
    expect(row.queryByTitle('編輯支出')).toBeNull();
    expect(document.body.textContent).not.toContain('提出疑問');
  });

  it('點下去就打開那筆帳——刪除在表單裡', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    list([noodles], { onEdit });

    await user.click(screen.getByTestId('expense-open-e-noodle'));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-noodle' }));
  });

  it('不能編輯的人，點下去是去提出疑問的地方', async () => {
    const onEdit = vi.fn();
    const onOpenDisputes = vi.fn();
    const user = userEvent.setup();
    // Recorded by Gina, so he may not edit it.
    const hers = expense({ ...noodles, id: 'e-hers', createdByMemberId: GINA });
    list([hers], { onEdit, onOpenDisputes });

    await user.click(screen.getByTestId('expense-open-e-hers'));

    expect(onEdit).not.toHaveBeenCalled();
    expect(onOpenDisputes).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-hers' }));
  });
});

describe('日期標頭', () => {
  it('寫成 10/02 週五 小計 TWD', () => {
    list([noodles]);

    expect(screen.getByText('10/02')).toBeTruthy();
    expect(screen.getByText('週五')).toBeTruthy();
    expect(document.body.textContent).toContain('TWD 363');
  });
});

/**
 * 「若是在結帳時已退稅，要回頭去去掉該筆帳的總額。點開可看到計算」.
 *
 * The row has to show the figure that matches the card bill, and it has to show
 * its working — a number nobody can reconstruct is a number nobody can check.
 */
describe('已經退稅的那一筆', () => {
  const lipstick = expense({
    id: 'e-lipstick', description: '口紅', amount: 18000, twdAmount: 414,
    currency: 'KRW', exchangeRate: 0.023, payerId: ME, beneficiaries: [],
    taxRefundedAtPurchase: true, taxRefundActual: 1080,
  });

  it('顯示扣完的金額，原價劃掉留在上面', () => {
    list([lipstick]);
    const row = within(screen.getByTestId('expense-row-e-lipstick'));

    expect(row.getByText('TWD 389')).toBeTruthy();
    expect(row.getByText('TWD 414').className).toContain('line-through');
  });

  it('那一列直接寫出扣了多少', () => {
    list([lipstick]);

    expect(screen.getByTestId('refund-deducted-e-lipstick').textContent).toContain('25');
  });

  it('沒退稅的帳目完全不受影響', () => {
    const plain = expense({ id: 'e-plain', description: '咖啡', amount: 150, twdAmount: 150, payerId: ME });
    list([plain]);
    const row = within(screen.getByTestId('expense-row-e-plain'));

    expect(row.getByText('TWD 150')).toBeTruthy();
    expect(screen.queryByTestId('refund-deducted-e-plain')).toBeNull();
  });
});

/**
 * 「怎麼都沒跳出可退稅的提示」.
 *
 * 耳機殼+手機殼 at 30,800 KRW sat in the ledger looking exactly like the 8,000
 * KRW card that does not qualify. The refund estimate knew about it; the row,
 * which is what gets read while packing, said nothing.
 */
describe('一筆還能去退稅的購物', () => {
  const korea = { country: '韓國', currency: 'KRW', minSpend: 15000, refundRate: 0.06, notes: '' };

  const shopping = (id: string, amount: number, over: Partial<Expense> = {}) => expense({
    id, description: id, category: Category.SHOPPING, currency: 'KRW', exchangeRate: 0.023,
    amount, twdAmount: Math.round(amount * 0.023), payerId: ME, beneficiaries: [ME],
    ...over,
  });

  it('在那一列說「可退稅」', () => {
    list([shopping('e-case', 30800)], { taxRule: korea });

    expect(screen.getByTestId('refund-eligible-e-case')).toBeTruthy();
  });

  it('門檻以下的不說', () => {
    list([shopping('e-card', 8000)], { taxRule: korea });

    expect(screen.queryByTestId('refund-eligible-e-card')).toBeNull();
  });

  it('已經標記過的不再說', () => {
    // 不可退稅 is an answer; repeating the suggestion after it is noise.
    list([shopping('e-case', 30800, { taxRefundIneligible: true })], { taxRule: korea });

    expect(screen.queryByTestId('refund-eligible-e-case')).toBeNull();
  });

  it('沒有退稅規則時什麼都不說', () => {
    list([shopping('e-case', 30800)]);

    expect(screen.queryByTestId('refund-eligible-e-case')).toBeNull();
  });
});

/**
 * 「這幾個不符合退稅資格 我有標記 但你黃色標籤依然標退稅資格」.
 *
 * The row carried its own copy of the rule — one that knew nothing about
 * 不可退稅, nothing about 結帳時已退稅, and nothing about the other categories a
 * bought thing lands in. It went on promising a refund on purchases the
 * traveller had already ruled out, next to a card that had stopped counting
 * them.
 */
describe('退稅資格這個標籤', () => {
  const korea = { country: '韓國', currency: 'KRW', minSpend: 15000, refundRate: 0.06, notes: '' };

  const bought = (id: string, amount: number, over: Partial<Expense> = {}) => expense({
    id, description: id, category: Category.SHOPPING, currency: 'KRW', exchangeRate: 0.023,
    amount, twdAmount: Math.round(amount * 0.023), payerId: ME, beneficiaries: [ME],
    ...over,
  });

  it('標記不可退稅之後就不再出現', () => {
    list([bought('e-ring', 15000, { taxRefundIneligible: true })], { taxRule: korea });

    expect(screen.queryByTestId('refund-eligible-e-ring')).toBeNull();
    expect(screen.queryByText('退稅資格')).toBeNull();
  });

  it('結帳時已退稅的也不再出現', () => {
    list([bought('e-case', 30800, { taxRefundedAtPurchase: true })], { taxRule: korea });

    expect(screen.queryByTestId('refund-eligible-e-case')).toBeNull();
  });

  it('伴手禮也算，跟退稅卡一致', () => {
    list([bought('e-cup', 18900, { category: Category.SOUVENIR })], { taxRule: korea });

    expect(screen.getByTestId('refund-eligible-e-cup')).toBeTruthy();
  });

  it('餐飲永遠不會被標成可退稅', () => {
    list([bought('e-dinner', 40000, { category: Category.FOOD })], { taxRule: korea });

    expect(screen.queryByTestId('refund-eligible-e-dinner')).toBeNull();
  });
});
