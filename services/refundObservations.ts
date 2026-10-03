import { Expense } from '../types';

/**
 * What the counter actually paid back, and what can honestly be learned from it.
 *
 * 「如果按下去 可以輸入正確退稅金額 你之後就能反推退稅的規則？」 — yes, but less
 * than the question hopes, and this module exists to hold that line.
 *
 * A refund is not a flat percentage of the purchase. The tax is a fixed share of
 * the pre-tax price, and the refund operator then takes a handling fee from a
 * banded table — so the effective rate moves with the amount, and small
 * purchases come back proportionally worse. One receipt is therefore one point
 * on a step function, not the slope of a line.
 *
 * What that supports:
 *  - replacing the estimate for that purchase with the fact, which needs no
 *    inference at all and is the larger half of the value
 *  - estimating a purchase of similar size from purchases of similar size
 *  - saying out loud when the researched rule and the receipts disagree
 *
 * What it does not support, and what nothing here will do: calling the result
 * 「the rule」. A handful of receipts from one operator is not the regulation,
 * and a rate inferred from them must never overwrite a looked-up rule.
 */

export type RefundChannel = 'at_till' | 'airport';

/**
 * One receipt, as a portable fact.
 *
 * 「我希望之後是各種用戶數據收集起來變成我們自己的資料」 — shaped so that
 * aggregating across travellers later is a matter of shipping these rows, not
 * of re-deriving them from somebody's ledger. Deliberately carries no expense
 * id, no trip and no person: what makes it useful is the money and the country,
 * and nothing else needs to travel.
 */
export interface RefundObservation {
  currency: string;
  /** The purchase, in that currency. */
  purchaseAmount: number;
  /** What came back. */
  refundAmount: number;
  channel: RefundChannel;
  destination?: string;
  observedAt?: string;
}

/** The effective rate this receipt implies, at this purchase size. */
export const observedRate = (observation: RefundObservation): number | undefined => {
  if (!Number.isFinite(observation.purchaseAmount) || observation.purchaseAmount <= 0) return undefined;
  if (!Number.isFinite(observation.refundAmount) || observation.refundAmount < 0) return undefined;
  const rate = observation.refundAmount / observation.purchaseAmount;
  // A refund larger than the purchase is a typo, not a rate. Korea's ceiling is
  // about 9%; anything past a quarter is certainly a mis-keyed figure.
  return rate > 0.25 ? undefined : rate;
};

/** The receipts a ledger holds, ready to be reasoned about or shipped. */
export const refundObservationsFrom = (
  expenses: Expense[],
  normalizeAmount: (expense: Expense) => number | undefined,
  currency: string,
  destination?: string,
): RefundObservation[] =>
  expenses.flatMap(expense => {
    if (!Number.isFinite(expense.taxRefundActual as number)) return [];
    const purchaseAmount = normalizeAmount(expense);
    if (purchaseAmount === undefined || !Number.isFinite(purchaseAmount) || purchaseAmount <= 0) return [];
    const observation: RefundObservation = {
      currency,
      purchaseAmount,
      refundAmount: expense.taxRefundActual as number,
      channel: expense.taxRefundChannel || (expense.taxRefundedAtPurchase ? 'at_till' : 'airport'),
      destination,
      observedAt: expense.date,
    };
    return observedRate(observation) === undefined ? [] : [observation];
  });

/**
 * Purchase sizes close enough that one says something about the other.
 *
 * Ratio rather than a fixed window, because the fee bands scale with the
 * amount: 50,000 tells you a lot about 60,000 and nothing about 500,000.
 */
const COMPARABLE_RATIO = 2;

const isComparable = (amount: number, other: number): boolean => {
  const [small, large] = amount <= other ? [amount, other] : [other, amount];
  return small > 0 && large / small <= COMPARABLE_RATIO;
};

export interface RateEstimate {
  rate: number;
  /** How many of the traveller's own receipts this came from. 0 = the looked-up rule. */
  sampleSize: number;
}

/**
 * The rate to estimate a purchase with.
 *
 * The traveller's own receipts win when any of them are about the same size and
 * from the same channel — they are measurements of the thing being estimated.
 * Otherwise the looked-up rule stands, because a rate borrowed from a purchase
 * ten times larger is worse than the published one.
 */
export const rateForAmount = (
  amount: number,
  observations: RefundObservation[],
  fallbackRate?: number,
  channel: RefundChannel = 'airport',
): RateEstimate | undefined => {
  const comparable = observations
    .filter(observation => observation.channel === channel && isComparable(amount, observation.purchaseAmount))
    .map(observedRate)
    .filter((rate): rate is number => rate !== undefined);

  if (comparable.length === 0) {
    return fallbackRate === undefined ? undefined : { rate: fallbackRate, sampleSize: 0 };
  }

  const mean = comparable.reduce((sum, rate) => sum + rate, 0) / comparable.length;
  return { rate: mean, sampleSize: comparable.length };
};

/**
 * True when the receipts and the looked-up rule disagree enough to say so.
 *
 * Not a correction — the rule stays. This is the card admitting that its own
 * estimate has been wrong every time so far, which is more useful than quietly
 * continuing to be wrong.
 */
export const RULE_DISAGREEMENT_THRESHOLD = 0.15;

export const ruleLooksWrong = (
  observations: RefundObservation[],
  ruleRate?: number,
): boolean => {
  if (ruleRate === undefined || ruleRate <= 0 || observations.length < 2) return false;
  const rates = observations.map(observedRate).filter((rate): rate is number => rate !== undefined);
  if (rates.length < 2) return false;
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  return Math.abs(mean - ruleRate) / ruleRate > RULE_DISAGREEMENT_THRESHOLD;
};
