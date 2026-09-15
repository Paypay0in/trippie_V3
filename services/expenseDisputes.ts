import { Expense, ExpenseDispute, ExpenseProposal, ExpenseProposalFields } from '../types';
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
  | {
      status: 'rejected';
      reason:
        | DisputeBlockReason
        | 'empty-message'
        | 'not-permitted'
        | 'not-found'
        | 'stale-proposal';
    }
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
    proposal,
    now = new Date().toISOString(),
  }: { message: string; id: string; proposal?: ExpenseProposal; now?: string },
): DisputeMutationOutcome => {
  const trimmed = message.trim();
  if (!trimmed) return { status: 'rejected', reason: 'empty-message' };

  const permission = canRaiseDispute(context);
  if (!permission.allowed) {
    return { status: 'rejected', reason: permission.reason || 'not-permitted' };
  }

  // A proposal that changes nothing is just a question, and is stored as one.
  const hasProposal = Boolean(
    proposal && Object.keys(proposal.changes).length > 0,
  );

  const dispute: ExpenseDispute = {
    id,
    raisedByMemberId: canonical(
      context.viewerMemberId,
      context.tripOwnerMemberId,
    ),
    message: trimmed,
    status: 'open',
    createdAt: now,
    ...(hasProposal ? { proposal } : {}),
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


/**
 * The fields a proposal is allowed to carry: what the expense costs and how it
 * is divided.
 *
 * "That number is wrong", "that one is not mine" and "my share should be 1000"
 * are the same argument at different resolutions, so all three are proposable.
 *
 * Payer stays out. Who actually handed over the money is a fact the creator
 * witnessed, not a matter of opinion — and a proposal that reassigns it reads
 * as an accusation rather than a correction.
 */
export const PROPOSAL_FIELDS: (keyof ExpenseProposalFields)[] = [
  'amount',
  'beneficiaries',
  'splitMethod',
  'splitAllocations',
];

const sameValue = (a: unknown, b: unknown): boolean => {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.005;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, number>;
    const right = b as Record<string, number>;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every(key => sameValue(left[key], right[key]));
  }
  return a === b;
};

/**
 * Build a proposal from an edited copy of an expense.
 *
 * Only fields that genuinely differ are recorded, alongside their original
 * values. Everything else is left out, so approval is a decision about a short
 * list of changes rather than about a whole re-entered form.
 */
export const buildExpenseProposal = (
  original: Expense,
  edited: Partial<ExpenseProposalFields>,
): ExpenseProposal => {
  const changes: Partial<ExpenseProposalFields> = {};
  const basedOn: Partial<ExpenseProposalFields> = {};

  PROPOSAL_FIELDS.forEach(field => {
    if (!(field in edited)) return;
    const next = edited[field];
    const current = original[field];
    if (next === undefined || sameValue(next, current)) return;
    (changes as Record<string, unknown>)[field] = next;
    (basedOn as Record<string, unknown>)[field] = current;
  });

  return { changes, basedOn };
};

/**
 * A proposal is stale once any field it touches has moved on from the value it
 * was written against. Applying it then would silently undo whatever happened
 * in between, so the creator has to see it and decide again.
 */
export const isDisputeProposalStale = (
  dispute: ExpenseDispute,
  expense: Expense,
): boolean => {
  if (!dispute.proposal) return false;
  return Object.keys(dispute.proposal.basedOn).some(key => {
    const field = key as keyof ExpenseProposalFields;
    return !sameValue(dispute.proposal!.basedOn[field], expense[field]);
  });
};

/** Human-readable list of the fields a proposal would change. */
export const getProposalChangedFields = (
  proposal: ExpenseProposal,
): (keyof ExpenseProposalFields)[] =>
  PROPOSAL_FIELDS.filter(field => field in proposal.changes);

/**
 * Accept a proposed correction: write the changed fields, then close the
 * question.
 *
 * Only the creator or the trip owner may approve, the same people who may
 * answer. When the amount changes, the TWD total is recomputed through the
 * expense's own rate and handling fee — this never invents its own arithmetic.
 */
export const approveDisputeProposal = (
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
  if (!existing || !existing.proposal) {
    return { status: 'rejected', reason: 'not-found' };
  }
  if (isDisputeProposalStale(existing, context.expense)) {
    return { status: 'rejected', reason: 'stale-proposal' };
  }

  const changes = existing.proposal.changes;
  const amount = changes.amount ?? context.expense.amount;
  const rate = Number.isFinite(context.expense.exchangeRate)
    ? context.expense.exchangeRate
    : 1;
  const handlingFee = context.expense.handlingFee || 0;

  const resolved: ExpenseDispute = {
    ...existing,
    status: 'resolved',
    response: response?.trim() || undefined,
    respondedByMemberId: canonical(
      context.viewerMemberId,
      context.tripOwnerMemberId,
    ),
    resolvedAt: now,
    appliedAt: now,
  };

  return {
    status: 'ok',
    dispute: resolved,
    expense: {
      ...context.expense,
      ...changes,
      // Recomputed only when the amount moved, and always through the record's
      // own rate so the total stays consistent with how it was first entered.
      ...(changes.amount !== undefined
        ? { twdAmount: amount * rate + handlingFee }
        : {}),
      disputes: getDisputes(context.expense).map(item =>
        item.id === disputeId ? resolved : item,
      ),
    },
  };
};


/**
 * True when an approved proposal is still exactly what the expense holds, so
 * undoing it would restore the original values rather than discard later work.
 */
export const canRevertDisputeProposal = (
  dispute: ExpenseDispute,
  expense: Expense,
): boolean => {
  if (!dispute.proposal) return false;
  // `appliedAt` marks an approval, but proposals approved before that marker
  // existed carry none. A resolved proposal whose values are exactly what the
  // expense holds was applied — otherwise there would be nothing to match.
  const wasApplied = Boolean(dispute.appliedAt) || dispute.status === 'resolved';
  if (!wasApplied) return false;
  return Object.keys(dispute.proposal.changes).every(key => {
    const field = key as keyof ExpenseProposalFields;
    return sameValue(dispute.proposal!.changes[field], expense[field]);
  });
};

/**
 * Undo an approved correction: put the original values back and reopen the
 * question.
 *
 * Approving is one tap, so changing your mind has to be one tap too — otherwise
 * the only way back is retyping the old numbers from memory. The question
 * returns to open rather than vanishing: the disagreement is live again, and
 * the thread keeps saying it was applied once and taken back.
 */
export const revertDisputeProposal = (
  context: DisputeContext,
  { disputeId, now = new Date().toISOString() }: { disputeId: string; now?: string },
): DisputeMutationOutcome => {
  if (!canRespondToDispute(context)) {
    return { status: 'rejected', reason: 'not-permitted' };
  }

  const existing = getDisputes(context.expense).find(
    item => item.id === disputeId,
  );
  if (!existing || !existing.proposal) {
    return { status: 'rejected', reason: 'not-found' };
  }
  // Someone edited the expense after approval; reverting would silently throw
  // that away, so it has to be decided by hand instead.
  if (!canRevertDisputeProposal(existing, context.expense)) {
    return { status: 'rejected', reason: 'stale-proposal' };
  }

  const basedOn = existing.proposal.basedOn;
  const amount = basedOn.amount ?? context.expense.amount;
  const rate = Number.isFinite(context.expense.exchangeRate)
    ? context.expense.exchangeRate
    : 1;
  const handlingFee = context.expense.handlingFee || 0;

  const reopened: ExpenseDispute = {
    ...existing,
    status: 'open',
    appliedAt: undefined,
    resolvedAt: undefined,
    response: undefined,
    respondedByMemberId: undefined,
  };

  return {
    status: 'ok',
    dispute: reopened,
    expense: {
      ...context.expense,
      ...basedOn,
      ...(basedOn.amount !== undefined
        ? { twdAmount: amount * rate + handlingFee }
        : {}),
      disputes: getDisputes(context.expense).map(item =>
        item.id === disputeId ? reopened : item,
      ),
    },
  };
};
