import { describe, expect, it } from 'vitest';
import { Expense } from '../types';
import { isSharedExpense, settlementExpensesFor } from './settlementScope';

/**
 * 「不應該可以看到他的帳」「只能看到有分帳的清單才對」.
 */
const bill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'e1',
    description: '火鍋餐點',
    amount: 663,
    currency: 'TWD',
    exchangeRate: 1,
    twdAmount: 663,
    category: '餐飲',
    paymentMethod: 'CASH_TWD',
    phase: 'during',
    date: '2026-10-07',
    payerId: 'me',
    beneficiaries: ['me'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

describe('哪些帳該出現在結算清單', () => {
  it('兩個人平分的要出現', () => {
    expect(isSharedExpense(bill({ beneficiaries: ['me', 'gina'] }))).toBe(true);
  });

  it('自己買給自己的不出現', () => {
    expect(isSharedExpense(bill({ payerId: 'gina', beneficiaries: ['gina'] }))).toBe(false);
  });

  it('一個人付、另一個人用，也是分帳', () => {
    expect(isSharedExpense(bill({ payerId: 'gina', beneficiaries: ['me'] }))).toBe(true);
  });

  it('指定金額分攤的看得出有兩個人', () => {
    expect(isSharedExpense(bill({
      beneficiaries: ['me'],
      splitMethod: 'EXACT',
      splitAllocations: { me: 400, gina: 263 },
    }))).toBe(true);
  });

  it('分攤表上只有自己、別人是 0，不算分帳', () => {
    expect(isSharedExpense(bill({
      splitAllocations: { me: 663, gina: 0 },
    }))).toBe(false);
  });

  it('兩個人各付一部分，是分帳', () => {
    expect(isSharedExpense(bill({
      payerAllocations: { me: 400, gina: 263 },
    }))).toBe(true);
  });
});

describe('以「我」的視角過濾結算清單', () => {
  const hers = bill({ id: 'hers', payerId: 'gina', beneficiaries: ['gina'] });
  const ours = bill({ id: 'ours', beneficiaries: ['me', 'gina'] });
  const theirs = bill({ id: 'theirs', payerId: 'gina', beneficiaries: ['gina', 'v'] });

  it('她自己買的，我看不到', () => {
    expect(settlementExpensesFor([hers, ours], 'me').map(e => e.id)).toEqual(['ours']);
  });

  it('她跟 V 之間分的，我沒參與，也看不到', () => {
    expect(settlementExpensesFor([theirs, ours], 'me').map(e => e.id)).toEqual(['ours']);
  });

  it('她幫我墊的，我看得到 —— 那是我要付錢的依據', () => {
    const covered = bill({ id: 'covered', payerId: 'gina', beneficiaries: ['me'] });
    expect(settlementExpensesFor([covered], 'me').map(e => e.id)).toEqual(['covered']);
  });

  it('不知道是誰在看的時候，不會把帳藏光', () => {
    expect(settlementExpensesFor([ours, theirs], undefined).map(e => e.id))
      .toEqual(['ours', 'theirs']);
  });

  it('沒有東西被濾掉時，原陣列原樣回傳', () => {
    const all = [ours];
    expect(settlementExpensesFor(all, 'me')).toBe(all);
  });
});
