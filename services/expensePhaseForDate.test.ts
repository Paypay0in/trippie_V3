import { describe, expect, it } from 'vitest';
import { Category } from '../types';
import { phaseForExpenseDate, phaseFromCategory } from './expensePhaseForDate';

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
