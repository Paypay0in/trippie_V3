import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import { adoptCategoriesFromLedger } from './customCategoriesFromLedger';
import { categoriesForPhase } from './customCategories';

/**
 * 「這兩個分類是我分別在電腦與手機創建的 但我目前用手機是看不到用電腦創建的分類」.
 */
const bill = (category: string, phase: Expense['phase'] = 'during'): Expense =>
  ({
    id: `e-${category}`,
    description: '',
    amount: 1,
    currency: 'KRW',
    exchangeRate: 1,
    twdAmount: 1,
    category: category as Category,
    paymentMethod: PaymentMethod.CASH_FOREIGN,
    phase,
    date: '2026-10-05',
    payerId: 'me',
    beneficiaries: ['me'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
  }) as Expense;

describe('從帳目認回分類', () => {
  it('電腦上建的分類，手機從帳目學到', () => {
    const adopted = adoptCategoriesFromLedger({}, [bill('美妝保養品')]);
    expect(categoriesForPhase('during', adopted)).toContain('美妝保養品');
  });

  it('內建分類不會被重複加進自訂清單', () => {
    const adopted = adoptCategoriesFromLedger({}, [bill(Category.FOOD)]);
    expect(adopted.during ?? []).not.toContain(Category.FOOD);
  });

  it('同一個分類出現很多次也只加一次', () => {
    const adopted = adoptCategoriesFromLedger({}, [
      bill('美妝保養品'), bill('美妝保養品'), bill('美妝保養品'),
    ]);
    expect((adopted.during ?? []).filter(n => n === '美妝保養品')).toHaveLength(1);
  });

  it('已經有的不會被動到', () => {
    const existing = { during: ['美妝保養品'] };
    expect(adoptCategoriesFromLedger(existing, [bill('美妝保養品')])).toEqual(existing);
  });

  it('分類記在它自己的階段', () => {
    const adopted = adoptCategoriesFromLedger({}, [bill('溫泉', 'pre')]);
    expect(adopted.pre ?? []).toContain('溫泉');
    expect(adopted.during ?? []).not.toContain('溫泉');
  });

  it('空白分類不會變成一個分類', () => {
    const adopted = adoptCategoriesFromLedger({}, [bill('   ')]);
    expect(adopted.during ?? []).toHaveLength(0);
  });
});
