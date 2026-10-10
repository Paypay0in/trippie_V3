import { describe, expect, it, vi } from 'vitest';
import { Category, Expense } from '../types';
import { needsRateRepair, repairExpenseRates } from './expenseRateRepair';

/**
 * 「10/3的 有辦法讓匯率 就用10/3的嗎」「連舊的一起算」.
 */
const bill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'olive-young',
    description: 'OLIVE YOUNG 美妝保養品',
    amount: 18000,
    currency: 'KRW',
    // 408 TWD, from a rate that belonged to no particular day.
    exchangeRate: 0.02267,
    twdAmount: 408,
    category: Category.COSMETICS,
    paymentMethod: 'CASH_TWD',
    phase: 'during',
    date: '2026-10-03',
    payerId: 'me',
    beneficiaries: ['me'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

const rateFor = vi.fn(async (currency: string, date: string) =>
  currency === 'KRW' && date === '2026-10-03' ? 0.023694 : null,
);

describe('哪些帳需要修', () => {
  it('匯率不是消費當天的，要修', () => {
    expect(needsRateRepair(bill())).toBe(true);
  });

  it('已經是當天匯率的，不動', () => {
    expect(needsRateRepair(bill({ exchangeRateDate: '2026-10-03' }))).toBe(false);
  });

  it('本來就是台幣的，沒有匯率問題', () => {
    expect(needsRateRepair(bill({ currency: 'TWD' }))).toBe(false);
  });

  it('連日期都讀不出來的，沒有基準可以修', () => {
    expect(needsRateRepair(bill({ date: '' }))).toBe(false);
  });
});

describe('舊帳重算', () => {
  it('18000 KRW 用 10/03 的匯率換成 426 元', async () => {
    const { expenses, repaired } = await repairExpenseRates([bill()], { rateFor });
    expect(repaired).toBe(1);
    expect(expenses[0].exchangeRate).toBeCloseTo(0.023694);
    expect(expenses[0].exchangeRateDate).toBe('2026-10-03');
    expect(Math.round(expenses[0].twdAmount)).toBe(426);
  });

  it('同一天同幣別的多筆，只查一次匯率', async () => {
    const lookup = vi.fn(async () => 0.023694);
    await repairExpenseRates(
      [bill({ id: 'a' }), bill({ id: 'b' }), bill({ id: 'c' })],
      { rateFor: lookup },
    );
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('查不到那天的匯率就原封不動，不用今天的頂替', async () => {
    const { expenses, repaired } = await repairExpenseRates(
      [bill({ date: '2026-10-05' })],
      { rateFor },
    );
    expect(repaired).toBe(0);
    expect(expenses[0].twdAmount).toBe(408);
    expect(expenses[0].exchangeRateDate).toBeUndefined();
  });

  it('沒有任何一筆要修的時候，原陣列原樣回傳', async () => {
    const already = [bill({ exchangeRateDate: '2026-10-03' })];
    const { expenses, repaired } = await repairExpenseRates(already, { rateFor });
    expect(repaired).toBe(0);
    expect(expenses).toBe(already);
  });
});
