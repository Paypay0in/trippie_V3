import { Expense } from '../types';

/**
 * What this traveller actually spends, counted from their own ledger.
 *
 * The planner needs a budget to plan against, and asking for one every time is
 * a question the app can usually answer for itself. Counted from recorded
 * expenses rather than inferred from anything softer: a number derived from
 * what someone really paid can be shown to them and checked, which is what
 * makes it safe to hand to a model.
 *
 * Deliberately not a claim about preference. Three restaurant bills say what a
 * trip cost, not what this person likes, and the wording everywhere downstream
 * is 「你過去的旅程平均每天 X」 rather than 「你的預算是 X」.
 */

export interface SpendingProfile {
  /** Mean spend per travel day, in TWD. */
  dailyAverageTwd: number;
  /** Trips the average was computed from, so a thin sample can be said to be thin. */
  tripCount: number;
  /** Expenses behind it — under a handful, the average is not worth showing. */
  expenseCount: number;
}

/**
 * @param trips each past trip's expenses and how many days it ran.
 */
export const spendingProfile = (
  trips: Array<{ expenses: Expense[]; days: number }>,
): SpendingProfile | null => {
  const usable = trips.filter(trip => trip.days > 0 && trip.expenses.length > 0);
  const expenseCount = usable.reduce((sum, trip) => sum + trip.expenses.length, 0);
  // Under five expenses across everything, the "average" is one dinner and a
  // taxi. Saying nothing beats planning a week around it.
  if (usable.length === 0 || expenseCount < 5) return null;

  const totalSpend = usable.reduce(
    (sum, trip) => sum + trip.expenses.reduce((inner, expense) => inner + (expense.twdAmount || 0), 0),
    0,
  );
  const totalDays = usable.reduce((sum, trip) => sum + trip.days, 0);
  if (totalDays === 0 || totalSpend <= 0) return null;

  const dailyAverageTwd = Math.round(totalSpend / totalDays);
  return {
    dailyAverageTwd,
    tripCount: usable.length,
    expenseCount,
  };
};

/**
 * One line for the planner: a number, and nothing about the person.
 *
 * An earlier version handed over a band — 精省 / 中等 / 寬裕 — and the planner
 * duly wrote 「考量您過往非常精省的預算習慣」 back to the traveller. That is a
 * label applied to someone from their own receipts, and it is both presumptuous
 * and often wrong: the same person spends differently on a honeymoon and a
 * weekend away. The average is a fact about past trips; who they are is not
 * ours to summarise.
 */
export const spendingProfileBrief = (profile: SpendingProfile | null): string => {
  if (!profile) return '';
  return `這位旅人過去 ${profile.tripCount} 趟旅程平均每天花費約 NT$${profile.dailyAverageTwd.toLocaleString()}。這是過去的紀錄，不是他說出口的預算。規劃時可以用這個數字對照方案花費，但**不要用形容詞描述或評價他的消費習慣**，也不要在回覆中提起這個數字是怎麼來的。`;
};
