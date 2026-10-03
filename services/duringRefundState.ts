import { Category, Expense, TravelRules } from '../types';
import { calculateExpenseLedger } from './splitCalculator';

/**
 * One eligible purchase, with the two numbers the card has to show.
 *
 * 「退稅的金額要寫在該項目旁邊 加總的在上面」. The list showed each purchase at
 * what it cost and the refund only as a single total above it, so there was no
 * way to tell which of two pairs of glasses was worth carrying to the counter.
 *
 * `amount` is normalised into the rule's currency, which is what the threshold
 * and the total are judged on — a purchase recorded in TWD would otherwise be
 * printed beside a refund derived from a different number, and the rows would
 * not add up to the figure above them.
 */
export interface RefundCandidate {
  expense: Expense;
  /** The purchase, in the rule's currency. */
  amount: number;
  /** What this one purchase is estimated to refund, when a rate is known. */
  refund?: number;
}

export type DuringRefundState =
  | { status: 'no_rule' }
  | { status: 'below_threshold'; currency: string; threshold: number; shoppingSpend: number; belowThresholdExpenses: Expense[]; belowThresholdItems: RefundCandidate[]; ruleSource: 'grounded' | 'model_knowledge'; refundRate?: number }
  | { status: 'threshold_met'; currency: string; threshold: number; eligibleExpenses: Expense[]; eligibleItems: RefundCandidate[]; eligibleSpend: number; ruleSource: 'grounded' | 'model_knowledge'; refundRate?: number }
  | { status: 'estimate_available'; currency: string; threshold: number; eligibleExpenses: Expense[]; eligibleItems: RefundCandidate[]; eligibleSpend: number; estimatedRefund: number; ruleSource: 'grounded' | 'model_knowledge'; refundRate?: number };

type ValidRule = { currency: string; minSpend: number; rate?: number; ruleSource: 'grounded' | 'model_knowledge' };

const getValidRule = (travelRules?: TravelRules | null): ValidRule | undefined => {
  const taxRefund = travelRules?.taxRefund;
  const rule = taxRefund?.numericRule;
  if (taxRefund?.numericCalculationAvailable !== true || !rule) return undefined;
  if (typeof rule.currency !== 'string' || !rule.currency.trim()) return undefined;
  if (rule.thresholdScope !== 'per_transaction' || !Number.isFinite(rule.minSpend) || rule.minSpend < 0) return undefined;
  const ruleSource = taxRefund.numericRuleSource || 'grounded';
  if (rule.refundMethod.type === 'rate') {
    if (!Number.isFinite(rule.refundMethod.rate) || rule.refundMethod.rate <= 0 || rule.refundMethod.rate >= 1) return undefined;
    return { currency: rule.currency.trim().toUpperCase(), minSpend: rule.minSpend, rate: rule.refundMethod.rate, ruleSource };
  }
  if (rule.refundMethod.type === 'not_calculable') {
    return { currency: rule.currency.trim().toUpperCase(), minSpend: rule.minSpend, ruleSource };
  }
  return undefined;
};

export const deriveDuringRefundState = ({
  expenses,
  travelRules,
  viewerMemberId,
  tripOwnerMemberId,
}: {
  expenses: Expense[];
  travelRules?: TravelRules | null;
  /**
   * Whose refund this is.
   *
   * 「我的介面 這裡出現 Gina 的退稅明細 他自己的帳不應出現在我這」. The list read
   * every shopping expense on the trip, so her sunglasses were sitting in his
   * estimate — and in his total.
   *
   * A refund belongs to whoever paid, not to whoever shares the cost: the
   * receipt is in their name and it is their passport at the counter. A bill
   * she paid and split with him is still hers to claim.
   *
   * Omitted on a single-user ledger, where every purchase is the reader's.
   */
  viewerMemberId?: string;
  tripOwnerMemberId?: string;
}): DuringRefundState => {
  const rule = getValidRule(travelRules);
  if (!rule) return { status: 'no_rule' };
  const mine = viewerMemberId
    // Asked through the ledger rather than by comparing `payerId`, so the
    // owner's seat alias resolves the same way it does everywhere else.
    ? expenses.filter(expense => {
        if (!Number.isFinite(expense.twdAmount)) return false;
        const { paid } = calculateExpenseLedger(expense, tripOwnerMemberId);
        return (paid[viewerMemberId] || 0) > 0;
      })
    : expenses;
  const shoppingExpenses = mine.filter(expense => expense.phase === 'during' && expense.category === Category.SHOPPING);
  const targetCurrencyRate = shoppingExpenses.find(expense => expense.currency.toUpperCase() === rule.currency && Number.isFinite(expense.exchangeRate) && expense.exchangeRate > 0)?.exchangeRate;
  const normalizeAmount = (expense: Expense): number | undefined => {
    if (expense.currency.toUpperCase() === rule.currency) return expense.amount;
    if (!targetCurrencyRate || !Number.isFinite(expense.twdAmount)) return undefined;
    return expense.twdAmount / targetCurrencyRate;
  };
  const normalized = shoppingExpenses.map(expense => ({ expense, amount: normalizeAmount(expense) })).filter((item): item is { expense: Expense; amount: number } => item.amount !== undefined && Number.isFinite(item.amount));
  const eligible = normalized.filter(item => item.amount >= rule.minSpend);
  const belowThreshold = normalized.filter(item => item.amount < rule.minSpend);
  const eligibleSpend = eligible.reduce((sum, item) => sum + item.amount, 0);
  /*
    Each candidate carries its own refund, from the same rate the total uses.

    Deriving it again in the card would be a second rule, and two rules that
    agree today are two rules that disagree later — which is exactly how the
    spending totals came to say three different things on three screens.
  */
  const withRefund = (items: typeof normalized): RefundCandidate[] =>
    items.map(item => ({
      expense: item.expense,
      amount: item.amount,
      ...(rule.rate === undefined ? {} : { refund: item.amount * rule.rate }),
    }));

  if (eligible.length === 0) return { status: 'below_threshold', currency: rule.currency, threshold: rule.minSpend, shoppingSpend: normalized.reduce((sum, item) => sum + item.amount, 0), belowThresholdExpenses: belowThreshold.map(item => item.expense), belowThresholdItems: withRefund(belowThreshold), ruleSource: rule.ruleSource, refundRate: rule.rate };
  if (rule.rate === undefined) return { status: 'threshold_met', currency: rule.currency, threshold: rule.minSpend, eligibleExpenses: eligible.map(item => item.expense), eligibleItems: withRefund(eligible), eligibleSpend, ruleSource: rule.ruleSource };
  return { status: 'estimate_available', currency: rule.currency, threshold: rule.minSpend, eligibleExpenses: eligible.map(item => item.expense), eligibleItems: withRefund(eligible), eligibleSpend, estimatedRefund: eligibleSpend * rule.rate, ruleSource: rule.ruleSource, refundRate: rule.rate };
};
