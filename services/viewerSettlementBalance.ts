import { Expense, SettlementBatch, TripMember } from '../types';
import { expenseCostToViewer } from './viewerSpend';
import { calculateOutstandingDebts } from './settlementConsumption';

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
  /** The roster, so settlement targets can be matched to seats. */
  members?: TripMember[];
  /** Settlements already recorded. Omitted means none are known yet. */
  batches?: SettlementBatch[];
}

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
 * What is still outstanding for this traveller, after settlements.
 *
 * Positive: owed back to them. Negative: they still owe.
 *
 * 「已經結算完了結果還有數字」. The first version subtracted here — fronted
 * minus share — which is the balance BEFORE anybody paid anybody. It had no
 * way to know a settlement had been recorded, while the card beside it did,
 * so one screen printed two answers to one question. Worse, the fold built on
 * `tripIsSettled` could then never fire for a trip settled through the
 * settlement flow, which is every trip that ever owed anything.
 *
 * `calculateOutstandingDebts` is the one place that consumes settlement
 * batches, including the legacy format. This asks it rather than repeating
 * it: the arithmetic has one home, and agreement is structural rather than
 * maintained by hand.
 *
 * Rounded here rather than at the caller, so 「the report shows no line」 and
 * 「the trip is settled」 cannot be decided from differently rounded copies of
 * the same number.
 */
export const viewerSettlementBalance = (
  { expenses, viewerMemberId, ownerMemberId, members, batches }: ViewerSettlementInput,
): number | undefined => {
  if (!viewerMemberId) return undefined;
  // Without a roster the owner seat would be lost, and with it the rule that
  // normalizes owner ids. Carry the caller's owner through instead of letting
  // it be derived from an empty list.
  const roster: TripMember[] = members?.length
    ? members
    : ownerMemberId
      ? [{ id: ownerMemberId, name: '', type: 'owner' }]
      : [];
  const debts = calculateOutstandingDebts(expenses, roster, batches ?? []);
  return Math.round(debts[viewerMemberId] || 0);
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
