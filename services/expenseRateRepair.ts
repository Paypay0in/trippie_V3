import { Expense } from '../types';

/**
 * Bills converted at a rate that was never theirs, put right.
 *
 * 「10/3的 有辦法讓匯率 就用10/3的嗎」「連舊的一起算」. Until now the rate came from
 * whenever the entry was written rather than when the money was spent, so one
 * 18,000 KRW purchase showed 408 TWD in the list, 427 at its own day's rate and
 * 432 at today's. None of the three was what was paid.
 *
 * Only bills that need it are touched, and only where a rate for their own day
 * can actually be had. A bill already carrying its spending date's rate, one in
 * the home currency, and one whose day the feed cannot answer for are all left
 * exactly as they are — an unrepaired figure the traveller can still recognise
 * beats a confidently rewritten guess.
 */

export interface RateRepairDeps {
  /** Resolves the rate for one currency on one day, or null when unavailable. */
  rateFor: (currency: string, date: string) => Promise<number | null>;
}

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** True when this bill's stored rate is not the one from the day it was spent. */
export const needsRateRepair = (expense: Expense, homeCurrency = 'TWD'): boolean => {
  if (!expense.currency || expense.currency === homeCurrency) return false;
  if (!isIsoDate(expense.date)) return false;
  return expense.exchangeRateDate !== expense.date;
};

export interface RateRepairResult {
  expenses: Expense[];
  /** How many bills were actually rewritten; zero means nothing to report. */
  repaired: number;
}

export const repairExpenseRates = async (
  expenses: Expense[],
  { rateFor }: RateRepairDeps,
  homeCurrency = 'TWD',
): Promise<RateRepairResult> => {
  const wanted = expenses.filter(expense => needsRateRepair(expense, homeCurrency));
  if (wanted.length === 0) return { expenses, repaired: 0 };

  // One lookup per currency-and-day, however many bills share it: a day of
  // shopping is a dozen receipts from the same shop at the same rate.
  const keyOf = (expense: Expense) => `${expense.currency}@${expense.date}`;
  const rates = new Map<string, number | null>();
  for (const key of new Set(wanted.map(keyOf))) {
    const [currency, date] = key.split('@');
    rates.set(key, await rateFor(currency, date));
  }

  let repaired = 0;
  const next = expenses.map(expense => {
    if (!needsRateRepair(expense, homeCurrency)) return expense;
    const rate = rates.get(keyOf(expense));
    if (rate === null || rate === undefined) return expense;
    repaired += 1;
    return {
      ...expense,
      exchangeRate: rate,
      exchangeRateDate: expense.date,
      twdAmount: expense.amount * rate,
    };
  });

  return { expenses: repaired > 0 ? next : expenses, repaired };
};
