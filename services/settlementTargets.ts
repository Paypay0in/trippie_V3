import { Expense, SettlementBatch, TripMember } from '../types';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * Accounting identities involved in the given expenses.
 *
 * A member is involved when they appear as payer, in `payerAllocations`, in
 * `beneficiaries`, or in `splitAllocations` — after owner-identity
 * normalization, so a legacy `me` or a foreign `<tripId>:owner` still resolves
 * to the current owner.
 */
export const collectExpenseParticipantIds = (
  expenses: Expense[],
  ownerMemberId?: string,
): Set<string> => {
  const ids = new Set<string>();
  expenses.forEach(expense => {
    [
      expense.payerId,
      ...Object.keys(expense.payerAllocations || {}),
      ...(expense.beneficiaries || []),
      ...Object.keys(expense.splitAllocations || {}),
    ].forEach(rawId => {
      if (!rawId) return;
      ids.add(ownerMemberId ? normalizeOwnerMemberId(rawId, ownerMemberId) : rawId);
    });
  });
  return ids;
};

/**
 * Selectable settlement targets: the union of the selected expenses' members,
 * minus the owner (the implicit counterparty), de-duplicated by TripMember id
 * and returned in roster order.
 *
 * A member who takes part in none of the selected expenses is never a target.
 */
export const buildSettlementTargets = (
  selectedExpenses: Expense[],
  members: TripMember[],
  ownerMemberId?: string,
): TripMember[] => {
  const participantIds = collectExpenseParticipantIds(selectedExpenses, ownerMemberId);
  return members.filter(
    member => member.id !== ownerMemberId && participantIds.has(member.id),
  );
};

/**
 * Reconcile a previous target selection with the currently available targets:
 * stale ids are dropped, newly available targets are selected by default, and
 * the existing order is preserved.
 */
export const reconcileSelectedTargets = (
  previousSelectedIds: string[],
  availableTargetIds: string[],
): string[] => {
  const kept = previousSelectedIds.filter(id => availableTargetIds.includes(id));
  const added = availableTargetIds.filter(id => !previousSelectedIds.includes(id));
  return [...kept, ...added];
};

/** A clean settlement draft. Starting a new settlement must never inherit the
 *  id of a batch opened earlier, or the confirm screen would display the new
 *  selection while acting on the old batch. */
export interface SettlementDraft {
  selectedBatchId: string | null;
  selectedExpenseIds: string[];
  selectedTargetIds: string[];
}

export const createSettlementDraft = (): SettlementDraft => ({
  selectedBatchId: null,
  selectedExpenseIds: [],
  selectedTargetIds: [],
});

/**
 * The targets a PERSISTED batch actually settles.
 *
 * The confirmation screen must read this, not the live selection: display and
 * action have to name the same batch, or settling "Jin" can mark Gina settled.
 * Owner aliases resolve first; the owner is never a target.
 */
export const resolveBatchTargets = (
  batch: { memberIds: string[] } | undefined,
  members: TripMember[],
  ownerMemberId?: string,
): TripMember[] => {
  if (!batch) return [];
  const settled = new Set(
    batch.memberIds.map(id => (ownerMemberId ? normalizeOwnerMemberId(id, ownerMemberId) : id)),
  );
  return members.filter(member => member.id !== ownerMemberId && settled.has(member.id));
};

/**
 * Runs an action at most once.
 *
 * A new settlement is created and completed by a single tap, so a double tap
 * must not produce two batches. The guard is claimed synchronously, before any
 * state update, which a `disabled` prop alone cannot guarantee.
 */
export const createOnceGuard = () => {
  let claimed = false;
  return (run: () => void): boolean => {
    if (claimed) return false;
    claimed = true;
    run();
    return true;
  };
};

export interface CompletedBatchInput {
  id: string;
  tripId: string;
  title: string;
  expenseIds: string[];
  targetIds: string[];
  startDate?: string;
  endDate?: string;
  balances: Record<string, number>;
  total: number;
  now: string;
}

/**
 * A settlement created and completed in one step.
 *
 * The new-settlement flow has no intermediate open batch: the batch is born
 * settled, with the batch-scoped result frozen at the moment of agreement.
 * Existing open batches keep their own manual completion path untouched.
 */
export const buildCompletedSettlementBatch = (input: CompletedBatchInput): SettlementBatch => ({
  id: input.id,
  tripId: input.tripId,
  title: input.title.trim() || '未命名結算',
  expenseIds: [...input.expenseIds],
  memberIds: [...input.targetIds],
  memberIdsKind: 'targets',
  startDate: input.startDate,
  endDate: input.endDate,
  status: 'settled',
  createdAt: input.now,
  settledAt: input.now,
  frozenResult: {
    balances: { ...input.balances },
    total: input.total,
    computedAt: input.now,
  },
});
