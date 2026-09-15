import { Expense, TripMember, Category } from '../types';
import {
  MemberAmountConflict,
  normalizeMemberAmountRecord,
  normalizeMemberIds,
  normalizeOwnerMemberId,
} from './memberIdentity';

/**
 * Split expense accounting.
 *
 * Accounting base: getSplitBase(expense) = Math.round(expense.twdAmount).
 * `expense.twdAmount` is never mutated; spending statistics, wallet and
 * exchange-rate logic keep using the raw value. The rounded integer is used
 * only for split accounting so responsibility and payment derive from the same
 * number.
 *
 * This module is pure: no React, no I/O, no localStorage, no mutation of the
 * expenses passed in. Nothing here rewrites stored data or settlement batches.
 */

/** Values within this absolute distance are treated as equal. */
export const SPLIT_TOLERANCE = 0.5;

export interface AllocationIssue {
  expenseId: string;
  description: string;
  date: string;
  /**
   * UNRECONCILABLE: stored allocations match neither the TWD nor the percent shape.
   * EMPTY: an EXACT/PERCENT expense with a nonzero base and no allocations at all,
   * which credits the payer in full and leaves an otherwise invisible imbalance.
   * IDENTITY_CONFLICT: two aliases of the same member carry different non-zero
   * amounts, so their true responsibility or payment is ambiguous.
   */
  kind: 'UNRECONCILABLE' | 'EMPTY' | 'IDENTITY_CONFLICT';
  allocatedTotal: number;
  expectedTotal: number;
  /** Present only on IDENTITY_CONFLICT. */
  conflicts?: MemberAmountConflict[];
}

/**
 * The single owner-identity boundary for this module.
 *
 * Every id the calculator reads passes through here first, so 'me', an owner id
 * built from an older draft or trip id, and the current owner TripMember id are
 * one human before any arithmetic happens. There is no second normalization
 * system in this file: it all comes from services/memberIdentity.
 *
 * Aliases are collapsed, never summed. When two aliases disagree on a non-zero
 * amount the disagreement is reported rather than resolved by guesswork.
 */
export interface NormalizedExpenseIdentities {
  payerId: string;
  /** Unique canonical beneficiaries — this is the EQUAL denominator. */
  beneficiaries: string[];
  payerAllocations: Record<string, number> | undefined;
  splitAllocations: Record<string, number>;
  conflicts: MemberAmountConflict[];
}

export const normalizeExpenseIdentities = (
  expense: Expense,
  ownerMemberId?: string
): NormalizedExpenseIdentities => {
  if (!ownerMemberId) {
    return {
      payerId: expense.payerId,
      beneficiaries: Array.from(new Set(expense.beneficiaries || [])),
      payerAllocations: expense.payerAllocations,
      splitAllocations: { ...(expense.splitAllocations || {}) },
      conflicts: [],
    };
  }

  const payerAllocations = expense.payerAllocations
    ? normalizeMemberAmountRecord(expense.payerAllocations, ownerMemberId)
    : undefined;
  const splitAllocations = normalizeMemberAmountRecord(
    expense.splitAllocations || {},
    ownerMemberId
  );

  return {
    payerId: normalizeOwnerMemberId(expense.payerId, ownerMemberId),
    beneficiaries: normalizeMemberIds(expense.beneficiaries || [], ownerMemberId),
    payerAllocations: payerAllocations?.values,
    splitAllocations: splitAllocations.values,
    conflicts: [...(payerAllocations?.conflicts || []), ...splitAllocations.conflicts],
  };
};

/**
 * Expenses excluded from split accounting.
 * EXCHANGE: currency exchange is not a shared cost (pre-existing behavior).
 * HELP_BUY: handled by the separate 朋友代買 / 應收款 receivable flow, so counting
 * it here would show the same money in two places.
 */
export const isSplitRelevant = (expense: Expense): boolean =>
  expense.category !== Category.EXCHANGE && expense.category !== Category.HELP_BUY;

/** Accounting base for split. Never mutates the expense. */
export const getSplitBase = (expense: Expense): number => Math.round(expense.twdAmount);

const sumValues = (values: Record<string, number>): number =>
  Object.keys(values).reduce((sum, id) => sum + values[id], 0);

/**
 * Read-time normalizer for PERCENT allocations.
 *
 * Every version of ExpenseForm in this repository stores PERCENT allocations as
 * TWD amounts (`totalTwd * pct / 100`), so rule 1 below is a no-op for all data
 * this app has ever written. The percent-shaped branch exists only to keep
 * externally-sourced or imported records readable.
 *
 * Detection order matters and is deliberate:
 *   1. Sum matches the accounting base -> already TWD, returned untouched.
 *   2. Sum matches 100 while the base does not -> percent-shaped, converted.
 *   3. Neither -> returned untouched. Never guessed at, never discarded; the
 *      inconsistency stays visible via detectAllocationIssue.
 *
 * Rule 1 is evaluated first, which deterministically resolves the ambiguous
 * case where the base is itself ~100 in favour of the no-op.
 *
 * Pure and deterministic: the same stored record always yields the same result.
 */
export const normalizePercentAllocations = (
  allocations: Record<string, number>,
  base: number
): Record<string, number> => {
  const ids = Object.keys(allocations);
  if (ids.length === 0) return {};

  const total = sumValues(allocations);

  if (Math.abs(total - base) <= SPLIT_TOLERANCE) return { ...allocations };

  if (Math.abs(total - 100) <= SPLIT_TOLERANCE && Math.abs(base - 100) > SPLIT_TOLERANCE) {
    const converted: Record<string, number> = {};
    ids.forEach(id => {
      converted[id] = (allocations[id] * base) / 100;
    });
    return converted;
  }

  return { ...allocations };
};

/**
 * Read-time normalizer for payer allocations.
 *
 * Stored payer amounts sum to the raw `twdAmount`, while responsibility is
 * computed against the rounded base, so the two sides could differ by up to
 * half a TWD per expense and accumulate across a ledger. This reconciles the
 * credit side to the base exactly.
 *
 * Deterministic largest-remainder rule: every value is floored, then the
 * leftover units are handed out one at a time to the entries with the largest
 * discarded fraction, ties broken by ascending payer id. It is a no-op when the
 * values are already integers summing to the base.
 *
 * Mirrors the approved allocation-normalizer philosophy: only data already
 * within tolerance of the base is reconciled. Payer data that is materially off
 * is returned untouched rather than force-fitted, so broken records stay
 * visible instead of being silently repaired.
 *
 * Pure: never mutates the stored expense or persisted payerAllocations.
 */
export const normalizePayerAllocations = (
  paid: Record<string, number>,
  base: number
): Record<string, number> => {
  const ids = Object.keys(paid);
  if (ids.length === 0) return {};

  const total = sumValues(paid);
  if (Math.abs(total - base) > SPLIT_TOLERANCE) return { ...paid };

  const out: Record<string, number> = {};
  let allocated = 0;
  ids.forEach(id => {
    const floored = Math.floor(paid[id]);
    out[id] = floored;
    allocated += floored;
  });

  let leftover = Math.round(base - allocated);
  if (leftover === 0) return out;

  const step = leftover > 0 ? 1 : -1;
  const order = ids
    .map(id => ({ id, fraction: paid[id] - Math.floor(paid[id]) }))
    .sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id))
    .map(entry => entry.id);

  let cursor = 0;
  while (leftover !== 0) {
    out[order[cursor % order.length]] += step;
    leftover -= step;
    cursor += 1;
  }
  return out;
};

/**
 * Allocations actually used for accounting, after normalization.
 * EXACT is stored as TWD and read as TWD. PERCENT is stored as TWD by this app
 * and is passed through the normalizer for safety.
 */
export const getEffectiveAllocations = (
  expense: Expense,
  ownerMemberId?: string
): Record<string, number> => {
  // Identity first, then shape: merging owner aliases changes the sum that
  // decides whether a record is percent-shaped or already TWD.
  const allocations = normalizeExpenseIdentities(expense, ownerMemberId).splitAllocations;
  if (expense.splitMethod !== 'PERCENT') return allocations;
  return normalizePercentAllocations(allocations, getSplitBase(expense));
};

/**
 * Report EXACT/PERCENT allocations that cannot be reconciled to the base.
 * Returns null when the expense is consistent or has nothing to reconcile.
 * Reporting only: this never repairs or drops the stored values.
 */
export const detectAllocationIssue = (
  expense: Expense,
  ownerMemberId?: string
): AllocationIssue | null => {
  if (!isSplitRelevant(expense)) return null;

  const expectedTotal = getSplitBase(expense);
  const identities = normalizeExpenseIdentities(expense, ownerMemberId);

  // Ambiguous money outranks shape checks: an alias disagreement means the
  // stored responsibility cannot be trusted, so surface it first.
  if (identities.conflicts.length > 0) {
    return {
      expenseId: expense.id,
      description: expense.description,
      date: expense.date,
      kind: 'IDENTITY_CONFLICT',
      allocatedTotal: sumValues(identities.splitAllocations),
      expectedTotal,
      conflicts: identities.conflicts,
    };
  }

  if (expense.splitMethod === 'EQUAL') {
    // Nothing to share when the base rounds to zero.
    if (Math.abs(expectedTotal) <= SPLIT_TOLERANCE) return null;
    // A nonzero expense nobody shares: the payer is credited in full and
    // nothing is debited. Surface it; never fabricate beneficiaries.
    if (identities.beneficiaries.length === 0) {
      return {
        expenseId: expense.id,
        description: expense.description,
        date: expense.date,
        kind: 'EMPTY',
        allocatedTotal: 0,
        expectedTotal,
      };
    }
    return null;
  }

  if (expense.splitMethod !== 'EXACT' && expense.splitMethod !== 'PERCENT') return null;

  const allocations = identities.splitAllocations;

  if (Object.keys(allocations).length === 0) {
    // Nothing to allocate against a zero base is consistent, not broken.
    if (Math.abs(expectedTotal) <= SPLIT_TOLERANCE) return null;
    // A nonzero expense that allocates to nobody: the payer is credited in full
    // and nothing is debited. Report it so the imbalance stays visible; never
    // invent beneficiaries to paper over it.
    return {
      expenseId: expense.id,
      description: expense.description,
      date: expense.date,
      kind: 'EMPTY',
      allocatedTotal: 0,
      expectedTotal,
    };
  }

  const allocatedTotal = sumValues(getEffectiveAllocations(expense, ownerMemberId));

  if (Math.abs(allocatedTotal - expectedTotal) <= SPLIT_TOLERANCE) return null;

  return {
    expenseId: expense.id,
    description: expense.description,
    date: expense.date,
    kind: 'UNRECONCILABLE',
    allocatedTotal,
    expectedTotal,
  };
};

/**
 * Every allocation issue across a ledger, in input order.
 * Pass `members` so owner aliases are resolved before the checks run.
 */
export const collectAllocationIssues = (
  expenses: Expense[],
  members?: TripMember[]
): AllocationIssue[] => {
  const ownerMemberId = members?.find(member => member.type === 'owner')?.id;
  return expenses
    .map(expense => detectAllocationIssue(expense, ownerMemberId))
    .filter((issue): issue is AllocationIssue => issue !== null);
};

/** One expense, split into who owes what and who actually paid what. */
export interface ExpenseLedger {
  /** Canonical member id -> amount that member is responsible for. */
  responsibility: Record<string, number>;
  /** Canonical member id -> amount that member actually paid. */
  paid: Record<string, number>;
}

/**
 * Per-expense breakdown, with the original denominator and allocation math
 * fully intact.
 *
 * Exposed so settlement consumption can subtract an individual member's
 * discharged responsibility *after* the split is computed. Removing a member
 * before the split would change the EQUAL denominator and inflate everyone
 * else's share, which is exactly what must not happen.
 */
export const calculateExpenseLedger = (
  expense: Expense,
  ownerMemberId?: string
): ExpenseLedger => {
  const base = getSplitBase(expense);
  // Single normalization boundary: past this line every id is canonical, so
  // no alias can become a phantom member or inflate a denominator.
  const identities = normalizeExpenseIdentities(expense, ownerMemberId);
  const responsibility: Record<string, number> = {};

  // Ids are already canonical and unique; accumulate anyway so a ghost id
  // appearing twice in stored data cannot silently drop a share.
  const addResponsibility = (id: string, amount: number) => {
    responsibility[id] = (responsibility[id] || 0) + amount;
  };

  if (expense.splitMethod === 'EQUAL' && identities.beneficiaries.length) {
    // Denominator is the unique canonical beneficiary count, never the raw list.
    const share = base / identities.beneficiaries.length;
    identities.beneficiaries.forEach(id => addResponsibility(id, share));
  } else if (expense.splitMethod === 'EXACT' || expense.splitMethod === 'PERCENT') {
    const allocations = getEffectiveAllocations(expense, ownerMemberId);
    Object.keys(allocations).forEach(id => addResponsibility(id, allocations[id]));
  }

  const paid = normalizePayerAllocations(
    identities.payerAllocations || { [identities.payerId]: base },
    base
  );

  return { responsibility, paid };
};

/**
 * Net balance per member.
 * Positive = paid more than owed (should receive). Negative = owes.
 *
 * The payer is credited what they actually paid and debited their own share, so
 * paying for oneself nets to zero.
 */
export const calculateTripDebts = (expenses: Expense[], members: TripMember[]) => {
  const debts: Record<string, number> = Object.fromEntries(members.map(member => [member.id, 0]));
  const ownerMemberId = members.find(member => member.type === 'owner')?.id;

  expenses.filter(isSplitRelevant).forEach(expense => {
    const { responsibility, paid } = calculateExpenseLedger(expense, ownerMemberId);

    Object.keys(responsibility).forEach(id => {
      debts[id] = (debts[id] || 0) - responsibility[id];
    });
    Object.keys(paid).forEach(id => {
      debts[id] = (debts[id] || 0) + paid[id];
    });
  });

  return debts;
};
