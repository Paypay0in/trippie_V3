import { Expense, PaymentMethod } from '../types';
import {
  LEGACY_OWNER_ID,
  normalizeMemberAmountRecord,
  normalizeMemberIds,
  normalizeOwnerMemberId,
} from './memberIdentity';

/**
 * Read-time migration of legacy stored expenses.
 *
 * Historically this minted the literal owner alias `me` whenever an old record
 * had no payer. Every trip and draft carries its own id, and the canonical owner
 * TripMember id is derived from it (`<tripId>:owner`), so at every call site the
 * owner is known deterministically — no roster guessing, no companions[0], no
 * createdAt heuristics.
 *
 * Fail-closed: when the owner id is NOT known, the legacy `me` default is kept
 * exactly as before. Downstream readers normalize owner aliases anyway, so old
 * records stay correct either way; this simply stops minting new ones.
 *
 * Pure and idempotent: migrating an already-migrated expense returns the same
 * values, and the input object is never mutated.
 */

/** The canonical owner TripMember id for a trip or draft id. */
export const ownerMemberIdForTrip = (tripId?: string): string | undefined =>
  tripId ? `${tripId}:owner` : undefined;

export const migrateLegacyExpense = (raw: any, ownerMemberId?: string): Expense => {
  const updated: any = { ...raw };

  if (updated.paymentMethod === '現金') {
    updated.paymentMethod =
      updated.currency === 'TWD' ? PaymentMethod.CASH_TWD : PaymentMethod.CASH_FOREIGN;
  }

  if (!updated.payerId) {
    // Canonical when we know the owner; the legacy alias only as a fallback.
    const fallbackOwner = ownerMemberId || LEGACY_OWNER_ID;
    updated.payerId = fallbackOwner;
    updated.beneficiaries = [fallbackOwner];
  }

  if (!updated.splitMethod) {
    updated.splitMethod = 'EQUAL';
    updated.splitAllocations = {};
  }

  if (updated.needsReview === undefined) {
    updated.needsReview = false;
  }

  if (ownerMemberId) {
    updated.payerId = normalizeOwnerMemberId(updated.payerId, ownerMemberId);

    if (Array.isArray(updated.beneficiaries)) {
      updated.beneficiaries = normalizeMemberIds(updated.beneficiaries, ownerMemberId);
    }

    // Money records collapse owner aliases only when they agree. A genuine
    // disagreement between two aliases is left exactly as stored rather than
    // resolved by guesswork — the calculator reports it as an accounting issue.
    if (updated.payerAllocations && typeof updated.payerAllocations === 'object') {
      const normalized = normalizeMemberAmountRecord(updated.payerAllocations, ownerMemberId);
      if (normalized.conflicts.length === 0) updated.payerAllocations = normalized.values;
    }
    if (updated.splitAllocations && typeof updated.splitAllocations === 'object') {
      const normalized = normalizeMemberAmountRecord(updated.splitAllocations, ownerMemberId);
      if (normalized.conflicts.length === 0) updated.splitAllocations = normalized.values;
    }
  }

  return updated as Expense;
};

export const migrateLegacyExpenses = (data: any[], ownerMemberId?: string): Expense[] =>
  (Array.isArray(data) ? data : []).map(expense => migrateLegacyExpense(expense, ownerMemberId));
