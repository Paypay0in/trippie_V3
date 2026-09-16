import { Category, Expense, PaymentMethod, SplitMethod, TripMember } from '../types';

/**
 * Translation between the app's objects and the shared tables.
 *
 * Kept apart from the network calls so the risky half — field names, defaults,
 * what happens to a row written by an older client — is plain data and can be
 * tested without a database. A wrong mapping here does not fail loudly; it
 * silently drops money, which is the one outcome worth testing hardest.
 */

export interface ExpenseRow {
  id: string;
  trip_id: string;
  created_by_member_id: string | null;
  description: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  handling_fee: number;
  twd_amount: number;
  category: string | null;
  payment_method: string | null;
  phase: string | null;
  date: string | null;
  payer_id: string | null;
  payer_allocations: Record<string, number>;
  beneficiaries: string[];
  split_method: string;
  split_allocations: Record<string, number>;
  disputes: unknown[];
  needs_review: boolean;
  linked_shopping_item_id: string | null;
}

export interface TripMemberRow {
  id: string;
  trip_id: string;
  user_id: string | null;
  name: string;
  type: TripMember['type'];
}

export const toExpenseRow = (expense: Expense, tripId: string): ExpenseRow => ({
  id: expense.id,
  trip_id: tripId,
  created_by_member_id: expense.createdByMemberId ?? null,
  description: expense.description ?? '',
  amount: expense.amount,
  currency: expense.currency,
  exchange_rate: expense.exchangeRate,
  handling_fee: expense.handlingFee ?? 0,
  twd_amount: expense.twdAmount,
  category: expense.category ?? null,
  payment_method: expense.paymentMethod ?? null,
  phase: expense.phase ?? null,
  date: expense.date ?? null,
  payer_id: expense.payerId ?? null,
  payer_allocations: expense.payerAllocations ?? {},
  beneficiaries: expense.beneficiaries ?? [],
  split_method: expense.splitMethod ?? 'EQUAL',
  split_allocations: expense.splitAllocations ?? {},
  disputes: expense.disputes ?? [],
  needs_review: Boolean(expense.needsReview),
  linked_shopping_item_id: expense.linkedShoppingItemId ?? null,
});

/**
 * Read a row back into an Expense.
 *
 * Every optional column is defaulted rather than trusted: a row written by an
 * older client, or by hand in the SQL editor, must not produce an expense whose
 * split fields are undefined — the calculator would then quietly treat it as
 * shared by nobody.
 */
export const fromExpenseRow = (row: ExpenseRow): Expense => ({
  id: row.id,
  description: row.description ?? '',
  amount: Number(row.amount) || 0,
  currency: row.currency || 'TWD',
  exchangeRate: Number(row.exchange_rate) || 1,
  handlingFee: Number(row.handling_fee) || 0,
  twdAmount: Number(row.twd_amount) || 0,
  category: (row.category as Category) ?? Category.OTHER,
  paymentMethod: (row.payment_method as PaymentMethod) ?? PaymentMethod.CASH_TWD,
  phase: (row.phase as Expense['phase']) ?? 'during',
  date: row.date ?? '',
  createdByMemberId: row.created_by_member_id ?? undefined,
  payerId: row.payer_id ?? '',
  payerAllocations: row.payer_allocations ?? {},
  beneficiaries: Array.isArray(row.beneficiaries) ? row.beneficiaries : [],
  splitMethod: (row.split_method as SplitMethod) ?? 'EQUAL',
  splitAllocations: row.split_allocations ?? {},
  disputes: Array.isArray(row.disputes) ? (row.disputes as Expense['disputes']) : [],
  needsReview: Boolean(row.needs_review),
  linkedShoppingItemId: row.linked_shopping_item_id ?? undefined,
});

export const toMemberRow = (member: TripMember, tripId: string): TripMemberRow => ({
  id: member.id,
  trip_id: tripId,
  user_id: member.userId ?? null,
  name: member.name,
  type: member.type,
});

export const fromMemberRow = (row: TripMemberRow): TripMember => ({
  id: row.id,
  name: row.name,
  userId: row.user_id ?? undefined,
  type: row.type,
});
