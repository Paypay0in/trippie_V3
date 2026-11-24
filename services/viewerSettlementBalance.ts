import { Expense } from '../types';
import { expenseCostToViewer } from './viewerSpend';
import { calculateExpenseLedger } from './splitCalculator';

/**
 * What this traveller is still owed, or still owes, for the whole trip.
 *
 * 「我現在看一個已經結束的旅程 點進去都直接是結算金額的頁面 我覺得不太 OK」.
 *
 * A finished trip opens on its closing report because 「旅程結束後的總覽 是帳目的」
 * (2026-10-10). That was right while there is money in the air, and it keeps
 * being right for trips where there is not — which is what the Founder walked
 * into: a settled trip, nothing owed to anybody, still asking about money every
 * time it is opened.
 *
 * So the report is kept and the question is asked first: is anything still
 * open? That question already had an answer inside `TripSummaryModal`, computed
 * for the 待補付 / 待收回 line. Reading it a second time in `App.tsx` to decide
 * the landing would have been the exact shape that cost us 「怎麼一直在修重複的
 * 問題」 an hour ago — one rule, two homes, and the day they disagree the screen
 * says one thing while the number beside it says another.
 *
 * `undefined` means the question does not apply: nobody is reading as a member,
 * so there is no personal balance to be open or closed. A solo ledger is not
 * an unsettled one.
 */

export interface ViewerSettlementInput {
  expenses: Expense[];
  viewerMemberId?: string;
  ownerMemberId?: string;
}

/** Money that actually left this traveller's pocket, across the trip. */
const frontedBy = (
  { expenses, viewerMemberId, ownerMemberId }: ViewerSettlementInput,
): number | undefined => {
  if (!viewerMemberId) return undefined;
  return expenses.reduce((sum, expense) => {
    const { paid } = calculateExpenseLedger(expense, ownerMemberId);
    return sum + (paid[viewerMemberId] || 0);
  }, 0);
};

/** What this traveller is actually responsible for, out of the trip's total. */
export const viewerShareOfTrip = (
  { expenses, viewerMemberId, ownerMemberId }: ViewerSettlementInput,
): number | undefined => {
  if (!viewerMemberId) return undefined;
  return expenses.reduce(
    (sum, expense) => sum + expenseCostToViewer(expense, viewerMemberId, ownerMemberId),
    0,
  );
};

/**
 * Fronted minus owed, rounded the way the report prints it.
 *
 * Positive: owed back to this traveller. Negative: this traveller owes.
 * Rounded here rather than at the caller, so 「the report shows no line」 and
 * 「the trip is settled」 can never be decided from differently rounded copies
 * of the same subtraction.
 */
export const viewerSettlementBalance = (
  input: ViewerSettlementInput,
): number | undefined => {
  const fronted = frontedBy(input);
  const share = viewerShareOfTrip(input);
  if (fronted === undefined || share === undefined) return undefined;
  return Math.round(fronted - share);
};

/**
 * Whether the trip has nothing left to collect or pay.
 *
 * Absent is settled on purpose: a reader with no member identity has no debt
 * to resolve, and leading them with a settlement report answers a question
 * they did not ask.
 */
export const tripIsSettled = (input: ViewerSettlementInput): boolean =>
  (viewerSettlementBalance(input) ?? 0) === 0;
