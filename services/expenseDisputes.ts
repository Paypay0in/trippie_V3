import { Expense, ExpenseDispute } from '../types';
import { getExpenseCreatorMemberId } from './expensePermissions';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * Expense disputes — the outlet for members who are affected by a record but
 * may not change it.
 *
 * Ownership (services/expensePermissions) deliberately gives non-creators no
 * edit and no delete. Without a way to speak up that is a dead end: a member
 * who believes their share is wrong can only complain outside the app. A
 * dispute attaches a question to the record. It never moves money, never
 * changes the split, and never bypasses ownership — the creator still has to
 * make any correction themselves.
 *
 * Every function here is pure; persistence is the caller's job.
 */

export interface DisputeContext {
  expense: Expense;
  viewerMemberId: string;
  tripOwnerMemberId: string;
}

const canonical = (id: string, ownerId: string) =>
  normalizeOwnerMemberId(id, ownerId);

/**
 * Members touched by this expense: whoever paid and whoever it is split among.
 *
 * Only these people have standing to question it. A member who neither paid
 * nor owes anything has no stake in the record, and letting them file
 * questions would turn the ledger into a comment thread.
 */
export const getInvolvedMemberIds = (
  expense: Expense,
  tripOwnerMemberId: string,
): string[] => {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id && id.trim()) ids.add(canonical(id, tripOwnerMemberId));
  };

  add(expense.payerId);
  Object.keys(expense.payerAllocations || {}).forEach(add);
  (expense.beneficiaries || []).forEach(add);
  Object.keys(expense.splitAllocations || {}).forEach(add);

  return Array.from(ids);
};

export const isInvolvedMember = ({
  expense,
  viewerMemberId,
  tripOwnerMemberId,
}: DisputeContext): boolean =>
  getInvolvedMemberIds(expense, tripOwnerMemberId).includes(
    canonical(viewerMemberId, tripOwnerMemberId),
  );

export const getDisputes = (expense: Expense): ExpenseDispute[] =>
  expense.disputes || [];

export const getOpenDisputes = (expense: Expense): ExpenseDispute[] =>
  getDisputes(expense).filter(dispute => dispute.status === 'open');

/** The viewer's own unresolved question, if they already raised one. */
export const getOwnOpenDispute = ({
  expense,
  viewerMemberId,
  tripOwnerMemberId,
}: DisputeContext): ExpenseDispute | undefined =>
  getOpenDisputes(expense).find(
    dispute =>
      canonical(dispute.raisedByMemberId, tripOwnerMemberId) ===
      canonical(viewerMemberId, tripOwnerMemberId),
  );

export type DisputeBlockReason =
  | 'is-creator'
  | 'not-involved'
  | 'already-open';

export interface RaiseDisputePermission {
  allowed: boolean;
  reason?: DisputeBlockReason;
}

/**
 * Who may raise a question: an involved member who did not create the record
 * and does not already have one open.
 *
 * The creator is excluded because they can simply edit the expense — a
 * question to oneself is noise. One open question per member keeps the record
 * answerable instead of a pile of duplicates.
 */
export const canRaiseDispute = (
  context: DisputeContext,
): RaiseDisputePermission => {
  const { expense, viewerMemberId, tripOwnerMemberId } = context;
  const viewer = canonical(viewerMemberId, tripOwnerMemberId);
  const creator = getExpenseCreatorMemberId(expense, tripOwnerMemberId);

  if (viewer === creator) return { allowed: false, reason: 'is-creator' };
  if (!isInvolvedMember(context)) {
    return { allowed: false, reason: 'not-involved' };
  }
  if (getOwnOpenDispute(context)) {
    return { allowed: false, reason: 'already-open' };
  }
  return { allowed: true };
};

/**
 * Who may answer and close a question: the creator of the record, or the trip
 * owner. The owner is included because they already hold the administrative
 * delete path, so leaving them unable to close a question would let a stale
 * dispute outlive every other remedy.
 */
export const canRespondToDispute = ({
  expense,
  viewerMemberId,
  tripOwnerMemberId,
}: DisputeContext): boolean => {
  const viewer = canonical(viewerMemberId, tripOwnerMemberId);
  const creator = getExpenseCreatorMemberId(expense, tripOwnerMemberId);
  return (
    viewer === creator ||
    viewer === canonical(tripOwnerMemberId, tripOwnerMemberId)
  );
};

/** A member may always withdraw their own question. */
export const canWithdrawDispute = (
  dispute: ExpenseDispute,
  { viewerMemberId, tripOwnerMemberId }: Omit<DisputeContext, 'expense'>,
): boolean =>
  dispute.status === 'open' &&
  canonical(dispute.raisedByMemberId, tripOwnerMemberId) ===
    canonical(viewerMemberId, tripOwnerMemberId);

export type DisputeMutationOutcome =
  | { status: 'rejected'; reason: DisputeBlockReason | 'empty-message' | 'not-permitted' | 'not-found' }
  | { status: 'ok'; expense: Expense; dispute: ExpenseDispute };

/**
 * Attach a new question to the expense.
 *
 * Returns a new Expense; the input is never mutated, and money fields are
 * copied through untouched — a dispute is metadata, not an accounting event.
 */
export const raiseDispute = (
  context: DisputeContext,
  {
    message,
    id,
    now = new Date().toISOString(),
  }: { message: string; id: string; now?: string },
): DisputeMutationOutcome => {
  const trimmed = message.trim();
  if (!trimmed) return { status: 'rejected', reason: 'empty-message' };

  const permission = canRaiseDispute(context);
  if (!permission.allowed) {
    return { status: 'rejected', reason: permission.reason || 'not-permitted' };
  }

  const dispute: ExpenseDispute = {
    id,
    raisedByMemberId: canonical(
      context.viewerMemberId,
      context.tripOwnerMemberId,
    ),
    message: trimmed,
    status: 'open',
    createdAt: now,
  };

  return {
    status: 'ok',
    dispute,
    expense: {
      ...context.expense,
      disputes: [...getDisputes(context.expense), dispute],
    },
  };
};

/** Answer and close a question. Only the creator or the trip owner may do this. */
export const resolveDispute = (
  context: DisputeContext,
  {
    disputeId,
    response,
    now = new Date().toISOString(),
  }: { disputeId: string; response?: string; now?: string },
): DisputeMutationOutcome => {
  if (!canRespondToDispute(context)) {
    return { status: 'rejected', reason: 'not-permitted' };
  }

  const existing = getDisputes(context.expense).find(
    item => item.id === disputeId && item.status === 'open',
  );
  if (!existing) return { status: 'rejected', reason: 'not-found' };

  const resolved: ExpenseDispute = {
    ...existing,
    status: 'resolved',
    response: response?.trim() || undefined,
    respondedByMemberId: canonical(
      context.viewerMemberId,
      context.tripOwnerMemberId,
    ),
    resolvedAt: now,
  };

  return {
    status: 'ok',
    dispute: resolved,
    expense: {
      ...context.expense,
      disputes: getDisputes(context.expense).map(item =>
        item.id === disputeId ? resolved : item,
      ),
    },
  };
};

/** Take back a question you raised. */
export const withdrawDispute = (
  context: DisputeContext,
  { disputeId, now = new Date().toISOString() }: { disputeId: string; now?: string },
): DisputeMutationOutcome => {
  const existing = getDisputes(context.expense).find(
    item => item.id === disputeId,
  );
  if (!existing || existing.status !== 'open') {
    return { status: 'rejected', reason: 'not-found' };
  }
  if (
    !canWithdrawDispute(existing, {
      viewerMemberId: context.viewerMemberId,
      tripOwnerMemberId: context.tripOwnerMemberId,
    })
  ) {
    return { status: 'rejected', reason: 'not-permitted' };
  }

  const withdrawn: ExpenseDispute = {
    ...existing,
    status: 'withdrawn',
    resolvedAt: now,
  };

  return {
    status: 'ok',
    dispute: withdrawn,
    expense: {
      ...context.expense,
      disputes: getDisputes(context.expense).map(item =>
        item.id === disputeId ? withdrawn : item,
      ),
    },
  };
};

/** Count of open questions across a ledger, for a summary badge. */
export const countOpenDisputes = (expenses: Expense[]): number =>
  expenses.reduce((total, expense) => total + getOpenDisputes(expense).length, 0);
