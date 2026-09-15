import { Expense } from '../types';

/** How the Founder is browsing eligible expenses. Selection itself is shared. */
export type ExpenseSelectionMode = 'date' | 'category' | 'manual';

export const EXPENSE_SELECTION_MODES: Array<{ mode: ExpenseSelectionMode; label: string }> = [
  { mode: 'date', label: '依日期' },
  { mode: 'category', label: '依分類' },
  { mode: 'manual', label: '手動選擇' },
];

/** Categories actually present in the eligible expenses, in first-seen order. */
export const collectExpenseCategories = (expenses: Expense[]): string[] =>
  Array.from(new Set(expenses.map(expense => expense.category)));

/** Quick date filters offered above the date-mode list, plus a custom range. */
export type DateFilterKind = 'today' | 'recent3' | 'all' | 'custom';

export interface DateFilter {
  kind: DateFilterKind;
  /** Inclusive `YYYY-MM-DD` bounds; only read when `kind === 'custom'`. */
  start?: string;
  end?: string;
}

/** Local calendar date as `YYYY-MM-DD` — never UTC, which can be a day off. */
export const toDateKey = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const shiftDateKey = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(year, (month || 1) - 1, (day || 1) + days);
  return toDateKey(shifted);
};

/** Inclusive bounds for a filter, or `null` when it imposes no restriction. */
export const resolveDateRange = (
  filter: DateFilter,
  today: string,
): { start: string; end: string } | null => {
  if (filter.kind === 'all') return null;
  if (filter.kind === 'today') return { start: today, end: today };
  // 最近 3 天 = today plus the two preceding calendar days.
  if (filter.kind === 'recent3') return { start: shiftDateKey(today, -2), end: today };
  if (!filter.start && !filter.end) return null;
  return {
    start: filter.start || '0000-01-01',
    end: filter.end || '9999-12-31',
  };
};

export const filterExpensesByDateRange = (
  expenses: Expense[],
  range: { start: string; end: string } | null,
): Expense[] =>
  range
    ? expenses.filter(expense => expense.date >= range.start && expense.date <= range.end)
    : expenses;

/**
 * The expenses a mode should display. Modes only ever browse or filter — they
 * never change eligibility and never select anything on the Founder's behalf.
 */
export const filterExpensesForSelection = (
  eligible: Expense[],
  mode: ExpenseSelectionMode,
  activeCategory: string | null,
  dateRange?: { start: string; end: string } | null,
): Expense[] => {
  if (mode === 'category' && activeCategory) {
    return eligible.filter(expense => expense.category === activeCategory);
  }
  if (mode === 'date') {
    return filterExpensesByDateRange(eligible, dateRange ?? null);
  }
  return eligible;
};

/** Eligible expenses grouped by date, newest date first, for the date mode. */
export const groupExpensesByDate = (
  expenses: Expense[],
): Array<{ date: string; expenses: Expense[] }> => {
  const groups = new Map<string, Expense[]>();
  expenses.forEach(expense => {
    const bucket = groups.get(expense.date);
    if (bucket) bucket.push(expense);
    else groups.set(expense.date, [expense]);
  });
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, grouped]) => ({ date, expenses: grouped }));
};

/**
 * Summary of the canonical selection.
 *
 * Derived from the selected ids against every eligible expense, never from the
 * currently visible list, so a category filter cannot understate the total.
 */
export const summarizeSelection = (
  eligible: Expense[],
  selectedIds: string[],
): { count: number; total: number } => {
  const unique = new Set(selectedIds);
  const selected = eligible.filter(expense => unique.has(expense.id));
  return {
    count: selected.length,
    total: selected.reduce((sum, expense) => sum + expense.twdAmount, 0),
  };
};
