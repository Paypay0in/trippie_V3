/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { Category, Expense } from '../types';
import {
  customCategoryUndecided,
  decideCustomCategory,
  forgetCustomCategory,
  isCustomCategoryRefundable,
  loadRefundableCustomCategories,
  REFUNDABLE_CUSTOM_CATEGORIES_STORAGE_KEY,
} from './refundableCustomCategories';
import { isRefundableCategory } from './refundableCategories';
import { qualifiesForRefund } from './refundHint';

const KOREA = { currency: 'KRW', refundRate: 0.07, minSpend: 15000 };

const purchase = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', description: '藥局：唇膏與唇炎膏', amount: 25000, currency: 'KRW', twdAmount: 569,
  category: '保養美妝品' as Category, phase: 'during', date: '2026-10-05',
  ...over,
} as Expense);

describe('a category the traveller invented', () => {
  it('counts for a refund once they have said it holds goods', () => {
    // 「這個符合退稅資格但沒有顯示」: 保養美妝品 is not one of the built-in
    // buckets, so nothing could know a lipstick was in it.
    const decided = decideCustomCategory({}, '保養美妝品', true);

    expect(isRefundableCategory('保養美妝品' as Category, decided)).toBe(true);
    expect(qualifiesForRefund(purchase(), KOREA as never, decided)).toBe(true);
  });

  it('stays out when they have said it does not', () => {
    // 溫泉 and 按摩 are services; promising a refund on one is a wrong answer
    // rather than a missing one.
    const decided = decideCustomCategory({}, '溫泉', false);

    expect(isRefundableCategory('溫泉' as Category, decided)).toBe(false);
    expect(qualifiesForRefund(purchase({ category: '溫泉' as Category }), KOREA as never, decided)).toBe(false);
  });

  it('is silent until it has been answered for', () => {
    expect(isRefundableCategory('保養美妝品' as Category, {})).toBe(false);
    expect(qualifiesForRefund(purchase(), KOREA as never, {})).toBe(false);
  });

  it('tells an unanswered category apart from one answered no', () => {
    // Only the first is worth interrupting somebody about.
    const decided = decideCustomCategory({}, '溫泉', false);

    expect(customCategoryUndecided(decided, '保養美妝品')).toBe(true);
    expect(customCategoryUndecided(decided, '溫泉')).toBe(false);
  });

  it('leaves the built-in buckets exactly as they were', () => {
    expect(isRefundableCategory(Category.SHOPPING)).toBe(true);
    expect(isRefundableCategory(Category.FOOD)).toBe(false);
  });
});

describe('remembering the answer', () => {
  it('changes its mind when asked again', () => {
    const decided = decideCustomCategory(decideCustomCategory({}, '保養美妝品', false), '保養美妝品', true);

    expect(isCustomCategoryRefundable(decided, '保養美妝品')).toBe(true);
  });

  it('forgets a category that was deleted', () => {
    const decided = forgetCustomCategory(decideCustomCategory({}, '溫泉', true), '溫泉');

    expect(customCategoryUndecided(decided, '溫泉')).toBe(true);
  });

  it('ignores a blank name', () => {
    expect(decideCustomCategory({}, '  ', true)).toEqual({});
  });

  it('drops anything stored that is not an answer', () => {
    localStorage.setItem(REFUNDABLE_CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify({ 保養美妝品: true, 溫泉: 'yes' }));

    expect(loadRefundableCustomCategories()).toEqual({ 保養美妝品: true });
  });

  it('survives a corrupt store', () => {
    localStorage.setItem(REFUNDABLE_CUSTOM_CATEGORIES_STORAGE_KEY, 'not json');

    expect(loadRefundableCustomCategories()).toEqual({});
  });
});
