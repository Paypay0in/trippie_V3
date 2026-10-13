import { Expense } from '../types';
import { normalizeOwnerMemberId } from './memberIdentity';

/**
 * Ownership and permission contract for expenses.
 *
 * One rule decides everything: the TripMember who *created* an expense owns it.
 * Paying for an expense grants nothing — Gina can enter a receipt Ann paid, and
 * Gina stays the owner of that record. The trip owner keeps an administrative
 * delete path so a shared ledger can never be left with an unremovable entry,
 * but that path is marked so the UI can demand a stronger confirmation.
 *
 * Every function here is pure. UI components must not re-derive ownership or
 * re-implement the legacy fallback; they ask these helpers.
 */

export interface ExpensePermissionContext {
  expense: Expense;
  /** Canonical TripMember id of whoever is looking at the ledger. */
  viewerMemberId: string;
  /**
   * Whether that id is known rather than guessed.
   *
   * 「這還是我的帳 Gina 依然收到」. `resolveViewer` answers with the trip owner
   * when it cannot match the signed-in user to a seat, so on her device
   * `viewerMemberId` *was* his — and every question here then returned a
   * confident wrong answer: his expenses were hers to edit, to merge, to be
   * labelled with.
   *
   * The caller passes false only when it is both unsure and it matters: on a
   * solo trip the fallback is simply correct, because every expense really is
   * theirs. Optional so existing callers keep today's behaviour, and absent
   * means 「no reason to doubt it」.
   */
  viewerIsKnown?: boolean;
  /** Canonical TripMember id of the trip owner. */
  tripOwnerMemberId: string;
}

/**
 * The creator of an expense, as a canonical TripMember id.
 *
 * Legacy records (written before createdByMemberId existed) are attributed to
 * the trip owner. That is the conservative reading for how those records were
 * actually produced: until shared trips ship, only the owner could create an
 * expense, so the owner keeps working with their own history unchanged. This is
 * a read-time fallback, not a migration — nothing is rewritten on disk.
 *
 * Owner aliases (`me`, `<otherTripId>:owner`) collapse onto the active owner id
 * so an expense created under an older encoding is still owned by the same human.
 */
export const getExpenseCreatorMemberId = (
  expense: Pick<Expense, 'createdByMemberId'>,
  tripOwnerMemberId: string,
): string => {
  const stored = expense.createdByMemberId;
  if (!stored || !stored.trim()) return tripOwnerMemberId;
  return normalizeOwnerMemberId(stored, tripOwnerMemberId);
};

/**
 * True when the viewer is the member who created this expense.
 *
 * A viewer the app could not identify owns nothing. That is the honest answer
 * and the safe one: the alternative is the owner fallback asserting that one
 * traveller's records belong to another, which is what put his receipts in
 * her ledger asking to be merged.
 */
export const isExpenseCreator = ({
  expense,
  viewerMemberId,
  viewerIsKnown,
  tripOwnerMemberId,
}: ExpensePermissionContext): boolean => {
  if (viewerIsKnown === false) return false;
  return getExpenseCreatorMemberId(expense, tripOwnerMemberId) ===
    normalizeOwnerMemberId(viewerMemberId, tripOwnerMemberId);
};

/**
 * Edit is creator-only, with no administrative override.
 *
 * Amount, payer and split settings are the creator's statement of what
 * happened; a trip owner rewriting another member's numbers silently would be
 * indistinguishable from fraud in a shared ledger. The owner may remove an
 * entry (see canDeleteExpense) but not restate it.
 */
export const canEditExpense = (context: ExpensePermissionContext): boolean =>
  isExpenseCreator(context);

/** Why a delete is allowed, so the UI can pick the right confirmation. */
export type ExpenseDeleteReason = 'creator' | 'trip-owner-admin' | 'denied';

export interface ExpenseDeletePermission {
  allowed: boolean;
  reason: ExpenseDeleteReason;
  /**
   * True when the viewer is deleting someone else's record. The UI must show
   * the stronger admin confirmation, and this is the seam where an audit log
   * will attach once shared trips ship.
   */
  requiresAdminConfirmation: boolean;
  /** Creator of the record, for naming them in the admin confirmation. */
  creatorMemberId: string;
}

export const getExpenseDeletePermission = (
  context: ExpensePermissionContext,
): ExpenseDeletePermission => {
  const { viewerMemberId, viewerIsKnown, tripOwnerMemberId } = context;
  const creatorMemberId = getExpenseCreatorMemberId(
    context.expense,
    tripOwnerMemberId,
  );
  const viewer = normalizeOwnerMemberId(viewerMemberId, tripOwnerMemberId);

  /*
    A viewer the app could not identify deletes nothing — not even as owner.

    This is the sharpest edge of the owner fallback. `resolveViewer` answers
    with the trip owner when it cannot place the signed-in user, so the
    administrative branch below would have handed the second traveller the
    owner's power to remove anybody's record, behind a confirmation dialog
    that calls her the trip owner.
  */
  if (viewerIsKnown === false) {
    return {
      allowed: false,
      reason: 'denied',
      requiresAdminConfirmation: false,
      creatorMemberId,
    };
  }

  if (viewer === creatorMemberId) {
    return {
      allowed: true,
      reason: 'creator',
      requiresAdminConfirmation: false,
      creatorMemberId,
    };
  }

  if (viewer === normalizeOwnerMemberId(tripOwnerMemberId, tripOwnerMemberId)) {
    return {
      allowed: true,
      reason: 'trip-owner-admin',
      requiresAdminConfirmation: true,
      creatorMemberId,
    };
  }

  return {
    allowed: false,
    reason: 'denied',
    requiresAdminConfirmation: false,
    creatorMemberId,
  };
};

export const canDeleteExpense = (context: ExpensePermissionContext): boolean =>
  getExpenseDeletePermission(context).allowed;

export type ExpenseDeleteRequestOutcome =
  | { status: 'not-found' }
  | { status: 'denied'; expense: Expense; permission: ExpenseDeletePermission }
  | { status: 'allowed'; expense: Expense; permission: ExpenseDeletePermission };

/**
 * Resolve a delete request at the action boundary.
 *
 * Hiding the delete button is presentation, not enforcement: the handler is
 * still reachable from a stale render, a keyboard path, or a future sync
 * caller. Every delete goes through here first, so an unauthorized id can never
 * reach the state update regardless of what the UI showed.
 */
export const resolveExpenseDeleteRequest = ({
  expenses,
  expenseId,
  viewerMemberId,
  viewerIsKnown,
  tripOwnerMemberId,
}: {
  expenses: Expense[];
  expenseId: string;
  viewerMemberId: string;
  /** See `ExpensePermissionContext`. A guessed viewer deletes nothing. */
  viewerIsKnown?: boolean;
  tripOwnerMemberId: string;
}): ExpenseDeleteRequestOutcome => {
  const expense = expenses.find(item => item.id === expenseId);
  if (!expense) return { status: 'not-found' };

  const permission = getExpenseDeletePermission({
    expense,
    viewerMemberId,
    viewerIsKnown,
    tripOwnerMemberId,
  });

  return permission.allowed
    ? { status: 'allowed', expense, permission }
    : { status: 'denied', expense, permission };
};
