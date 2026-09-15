import { describe, it, expect } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import {
  DateFilter,
  EXPENSE_SELECTION_MODES,
  collectExpenseCategories,
  filterExpensesForSelection,
  groupExpensesByDate,
  resolveDateRange,
  shiftDateKey,
  summarizeSelection,
  toDateKey,
} from './settlementSelection';

const OWNER = 'trip-1:owner';

const expense = (overrides: Partial<Expense>): Expense => ({
  id: 'e1',
  description: '來回機票',
  amount: 6500,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 6500,
  category: Category.FLIGHT,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'pre',
  date: '2026-09-10',
  payerId: OWNER,
  beneficiaries: [OWNER],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  handlingFee: 0,
  needsReview: false,
  ...overrides,
});

const flight = expense({});
const noodles = expense({ id: 'e2', description: '牛肉麵', amount: 4, twdAmount: 4, category: Category.FOOD, date: '2026-09-12' });
const beef = expense({ id: 'e3', description: '牛', amount: 2, twdAmount: 2, category: Category.FOOD, date: '2026-09-12' });
const eligible = [flight, noodles, beef];

describe('expense selection modes', () => {
  it('exposes the three tabs in order, with date first', () => {
    expect(EXPENSE_SELECTION_MODES.map(m => m.mode)).toEqual(['date', 'category', 'manual']);
    expect(EXPENSE_SELECTION_MODES.map(m => m.label)).toEqual(['依日期', '依分類', '手動選擇']);
  });

  it('TEST B: manual mode shows every eligible expense, unfiltered', () => {
    expect(filterExpensesForSelection(eligible, 'manual', Category.FOOD)).toEqual(eligible);
  });

  it('date mode is never category-filtered', () => {
    expect(filterExpensesForSelection(eligible, 'date', Category.FOOD)).toEqual(eligible);
  });

  it('TEST A: category mode filters to the chosen category only', () => {
    expect(filterExpensesForSelection(eligible, 'category', Category.FOOD).map(e => e.id)).toEqual(['e2', 'e3']);
    expect(filterExpensesForSelection(eligible, 'category', Category.FLIGHT).map(e => e.id)).toEqual(['e1']);
  });

  it('category mode with no category chosen shows everything', () => {
    expect(filterExpensesForSelection(eligible, 'category', null)).toEqual(eligible);
  });

  it('offers only categories present in the eligible expenses', () => {
    expect(collectExpenseCategories(eligible)).toEqual([Category.FLIGHT, Category.FOOD]);
    expect(collectExpenseCategories([])).toEqual([]);
  });

  it('groups by date, newest first', () => {
    const groups = groupExpensesByDate(eligible);
    expect(groups.map(g => g.date)).toEqual(['2026-09-12', '2026-09-10']);
    expect(groups[0].expenses.map(e => e.id)).toEqual(['e2', 'e3']);
  });

  it('filtering never selects anything on its own', () => {
    const visible = filterExpensesForSelection(eligible, 'category', Category.FOOD);
    expect(summarizeSelection(eligible, []).count).toBe(0);
    expect(visible.length).toBe(2);
  });

  it('TEST C/D: the summary follows the canonical selection, not the visible list', () => {
    // Founder picked the flight in one mode and a noodle bowl in another.
    const selectedIds = ['e1', 'e2'];
    expect(summarizeSelection(eligible, selectedIds)).toEqual({ count: 2, total: 6504 });

    // A category filter hides the flight; the summary must not change.
    const visible = filterExpensesForSelection(eligible, 'category', Category.FOOD);
    expect(visible.some(e => e.id === 'e1')).toBe(false);
    expect(summarizeSelection(eligible, selectedIds)).toEqual({ count: 2, total: 6504 });
  });

  it('TEST D: repeated ids cannot inflate the summary', () => {
    expect(summarizeSelection(eligible, ['e1', 'e1', 'e2'])).toEqual({ count: 2, total: 6504 });
  });

  it('ignores ids that are no longer eligible', () => {
    expect(summarizeSelection(eligible, ['gone'])).toEqual({ count: 0, total: 0 });
  });
});

describe('date filter', () => {
  const today = '2026-09-12';
  const t1 = expense({ id: 'd1', date: today, twdAmount: 100, amount: 100 });
  const t2 = expense({ id: 'd2', date: today, twdAmount: 200, amount: 200 });
  const t3 = expense({ id: 'd3', date: today, twdAmount: 300, amount: 300 });
  const older = expense({ id: 'd4', date: '2026-09-01', twdAmount: 400, amount: 400 });
  const ledger = [t1, t2, t3, older];
  const visible = (filter: DateFilter) =>
    filterExpensesForSelection(ledger, 'date', null, resolveDateRange(filter, today)).map(e => e.id);

  it('ACCEPTANCE: 今天 shows only today’s three expenses', () => {
    expect(visible({ kind: 'today' })).toEqual(['d1', 'd2', 'd3']);
  });

  it('ACCEPTANCE: 最近 3 天 covers today and the two preceding days', () => {
    expect(resolveDateRange({ kind: 'recent3' }, today)).toEqual({ start: '2026-09-10', end: today });
    const recent = expense({ id: 'd5', date: '2026-09-10' });
    expect(
      filterExpensesForSelection([...ledger, recent], 'date', null, resolveDateRange({ kind: 'recent3' }, today)).map(e => e.id),
    ).toEqual(['d1', 'd2', 'd3', 'd5']);
  });

  it('ACCEPTANCE: 全部 shows all four', () => {
    expect(resolveDateRange({ kind: 'all' }, today)).toBeNull();
    expect(visible({ kind: 'all' })).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('crosses month boundaries correctly', () => {
    expect(resolveDateRange({ kind: 'recent3' }, '2026-09-01')).toEqual({ start: '2026-08-30', end: '2026-09-01' });
    expect(shiftDateKey('2026-01-01', -2)).toBe('2025-12-30');
  });

  it('supports a custom range, and an open-ended one', () => {
    expect(visible({ kind: 'custom', start: '2026-09-01', end: '2026-09-01' })).toEqual(['d4']);
    expect(visible({ kind: 'custom', start: '2026-09-02' })).toEqual(['d1', 'd2', 'd3']);
    expect(visible({ kind: 'custom', end: '2026-09-05' })).toEqual(['d4']);
    expect(visible({ kind: 'custom' })).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('filtering hides but never deselects, and the summary is unaffected', () => {
    const selectedIds = ['d4'];
    expect(visible({ kind: 'today' })).not.toContain('d4');
    expect(summarizeSelection(ledger, selectedIds)).toEqual({ count: 1, total: 400 });
  });

  it('date mode ignores the category filter', () => {
    expect(
      filterExpensesForSelection(ledger, 'date', Category.FOOD, resolveDateRange({ kind: 'all' }, today)).map(e => e.id),
    ).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('groups only when more than one date is visible', () => {
    expect(groupExpensesByDate(filterExpensesForSelection(ledger, 'date', null, resolveDateRange({ kind: 'today' }, today)))).toHaveLength(1);
    expect(groupExpensesByDate(ledger)).toHaveLength(2);
  });

  it('toDateKey uses the local calendar date', () => {
    expect(toDateKey(new Date(2026, 8, 12))).toBe('2026-09-12');
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
