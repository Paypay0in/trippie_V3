import { Category, Expense, TravelRules } from '../types';

export type DuringRefundState =
  | { status: 'no_rule' }
  | { status: 'below_threshold'; currency: string; threshold: number; shoppingSpend: number; belowThresholdExpenses: Expense[]; ruleSource: 'grounded' | 'model_knowledge'; refundRate?: number }
  | { status: 'threshold_met'; currency: string; threshold: number; eligibleExpenses: Expense[]; eligibleSpend: number; ruleSource: 'grounded' | 'model_knowledge'; refundRate?: number }
  | { status: 'estimate_available'; currency: string; threshold: number; eligibleExpenses: Expense[]; eligibleSpend: number; estimatedRefund: number; ruleSource: 'grounded' | 'model_knowledge'; refundRate?: number };

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

export const deriveDuringRefundState = ({ expenses, travelRules }: { expenses: Expense[]; travelRules?: TravelRules | null }): DuringRefundState => {
  const rule = getValidRule(travelRules);
  if (!rule) return { status: 'no_rule' };
  const shoppingExpenses = expenses.filter(expense => expense.phase === 'during' && expense.category === Category.SHOPPING);
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
  if (eligible.length === 0) return { status: 'below_threshold', currency: rule.currency, threshold: rule.minSpend, shoppingSpend: normalized.reduce((sum, item) => sum + item.amount, 0), belowThresholdExpenses: belowThreshold.map(item => item.expense), ruleSource: rule.ruleSource, refundRate: rule.rate };
  if (rule.rate === undefined) return { status: 'threshold_met', currency: rule.currency, threshold: rule.minSpend, eligibleExpenses: eligible.map(item => item.expense), eligibleSpend, ruleSource: rule.ruleSource };
  return { status: 'estimate_available', currency: rule.currency, threshold: rule.minSpend, eligibleExpenses: eligible.map(item => item.expense), eligibleSpend, estimatedRefund: eligibleSpend * rule.rate, ruleSource: rule.ruleSource, refundRate: rule.rate };
};
