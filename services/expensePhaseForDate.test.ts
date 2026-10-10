import { describe, expect, it } from 'vitest';
import { Category, Expense, Phase } from '../types';
import {
  phaseForExpenseDate,
  phaseFromCategory,
  refileExpensePhasesByDate,
} from './expensePhaseForDate';

/**
 * 「上傳的收據要按照時間點歸帳 10/3根本還沒回國」.
 */

const BUSAN = { startDate: '2026-10-02', endDate: '2026-10-07' };

describe('收據歸到哪一段', () => {
  it('旅程期間內的就是旅行中，不管買了什麼', () => {
    expect(phaseForExpenseDate('2026-10-03', BUSAN, Category.COSMETICS)).toBe('during');
    expect(phaseForExpenseDate('2026-10-03', BUSAN, Category.FASHION)).toBe('during');
    expect(phaseForExpenseDate('2026-10-03', BUSAN, Category.OTHER)).toBe('during');
  });

  it('出發前的進行前', () => {
    expect(phaseForExpenseDate('2026-09-20', BUSAN, Category.FOOD)).toBe('pre');
  });

  it('回國後的才進回國機場消費', () => {
    expect(phaseForExpenseDate('2026-10-08', BUSAN, Category.COSMETICS)).toBe('post');
  });

  it('頭尾那兩天算在旅程裡', () => {
    expect(phaseForExpenseDate('2026-10-02', BUSAN, Category.FOOD)).toBe('during');
    expect(phaseForExpenseDate('2026-10-07', BUSAN, Category.FOOD)).toBe('during');
  });

  it('只知道出發日，之後的都算旅程中', () => {
    expect(phaseForExpenseDate('2026-10-20', { startDate: '2026-10-02' }, Category.FOOD)).toBe('during');
    expect(phaseForExpenseDate('2026-09-01', { startDate: '2026-10-02' }, Category.FOOD)).toBe('pre');
  });
});

describe('日期答不出來的時候', () => {
  it('旅程還沒有日期，就退回用分類猜', () => {
    expect(phaseForExpenseDate('2026-10-03', {}, Category.FLIGHT)).toBe('pre');
    expect(phaseForExpenseDate('2026-10-03', {}, Category.FOOD)).toBe('during');
    expect(phaseForExpenseDate('2026-10-03', {}, Category.TRANSPORT_POST)).toBe('post');
  });

  it('收據自己沒有日期，也退回用分類猜', () => {
    expect(phaseForExpenseDate(undefined, BUSAN, Category.FLIGHT)).toBe('pre');
    expect(phaseForExpenseDate('不是日期', BUSAN, Category.FLIGHT)).toBe('pre');
  });
});

describe('用分類猜的時候', () => {
  it('同時出現在多張清單的，優先算旅行中', () => {
    // 其他 is in all three lists. Running 「pre then post」 in sequence made it
    // 'post' every time, which is how 10/03 ended up in 回國機場消費.
    expect(phaseFromCategory(Category.OTHER)).toBe('during');
    expect(phaseFromCategory(Category.SOUVENIR)).toBe('during');
  });

  it('只屬於某一段的就照那一段', () => {
    expect(phaseFromCategory(Category.FLIGHT)).toBe('pre');
    expect(phaseFromCategory(Category.ELECTRONICS)).toBe('post');
  });
});

/**
 * 「這些歸帳」「要按照日期」 — the 釜山 2026/10/02–10/07 recap, where OLIVE YOUNG
 * bought on 10/03 sat under 回國機場消費 because it was taken in before the rule.
 */
const bill = (over: Partial<Expense>): Expense =>
  ({
    id: 'e1',
    description: 'OLIVE YOUNG 美妝保養品',
    amount: 408,
    currency: 'TWD',
    exchangeRate: 1,
    twdAmount: 408,
    category: Category.COSMETICS,
    paymentMethod: 'CASH_TWD',
    phase: 'post' as Phase,
    date: '2026-10-03',
    payerId: 'me',
    beneficiaries: ['me'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

describe('舊帳重新按日期歸位', () => {
  it('行程期間內的從回國機場消費搬回旅行中', () => {
    const [refiled] = refileExpensePhasesByDate([bill({})], BUSAN);
    expect(refiled.phase).toBe('during');
  });

  it('本來就對的那筆原封不動', () => {
    const correct = bill({ date: '2026-10-09', phase: 'post' });
    const [refiled] = refileExpensePhasesByDate([correct], BUSAN);
    expect(refiled).toBe(correct);
  });

  it('收據日期讀不出來的不碰，免得又掉回用分類猜', () => {
    // 其他 guesses 'during', which would silently move a bill the traveller may
    // have filed under 回國機場消費 themselves.
    const undated = bill({ date: '', phase: 'post', category: Category.OTHER });
    const [refiled] = refileExpensePhasesByDate([undated], BUSAN);
    expect(refiled).toBe(undated);
  });

  it('旅程沒有日期就整批不動', () => {
    const bills = [bill({})];
    expect(refileExpensePhasesByDate(bills, {})).toBe(bills);
  });

  it('年份被讀錯而落在行程外的，照日期算就是行前', () => {
    // E'deff 咖啡廳 came in as 2024-10-26. Re-filing is honest about the date it
    // has; the wrong year itself is a separate repair.
    const [refiled] = refileExpensePhasesByDate(
      [bill({ date: '2024-10-26', category: Category.FOOD })],
      BUSAN,
    );
    expect(refiled.phase).toBe('pre');
  });
});
