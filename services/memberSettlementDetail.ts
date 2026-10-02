import { Expense, TripMember } from '../types';
import { calculateExpenseLedger } from './splitCalculator';
import { buildMinimumSettlementTransfers } from './minimumSettlement';

/**
 * Everybody's position on the trip, and the payments that close it.
 *
 * 「除了劃紅線區塊消除，其他請 100% 依這個介面設計還原分帳明細頁面」 — a screen
 * that names every member at once rather than the reader alone. Two travellers
 * reading two mirror-image screens can disagree about who owes whom; one table
 * naming all of them cannot.
 */

export interface MemberPosition {
  member: TripMember;
  /** Positive is owed to them; negative is owed by them. */
  net: number;
  /** Who pays them, or whom they pay, and how much. */
  transfers: Array<{ member: TripMember; amount: number }>;
}

export interface ExpenseBreakdown {
  expense: Expense;
  payer?: TripMember;
  /** Everyone carrying a share, excluding anyone carrying nothing. */
  owedBy: TripMember[];
  /** The even share, where every sharer carries the same amount. */
  perHead?: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** What each member has put in, minus what they have consumed. */
export const buildMemberPositions = (
  expenses: Expense[],
  members: TripMember[],
  ownerMemberId?: string,
): MemberPosition[] => {
  const net: Record<string, number> = {};
  members.forEach(member => { net[member.id] = 0; });

  expenses.forEach(expense => {
    if (!Number.isFinite(expense.twdAmount)) return;
    const { responsibility, paid } = calculateExpenseLedger(expense, ownerMemberId);
    Object.entries(paid).forEach(([id, amount]) => {
      if (Number.isFinite(amount)) net[id] = (net[id] || 0) + amount;
    });
    Object.entries(responsibility).forEach(([id, amount]) => {
      if (Number.isFinite(amount)) net[id] = (net[id] || 0) - amount;
    });
  });

  const transfers = buildMinimumSettlementTransfers(net);
  const find = (id: string) => members.find(member => member.id === id);

  return members.map(member => ({
    member,
    net: round(net[member.id] || 0),
    transfers: transfers
      .filter(transfer => transfer.fromMemberId === member.id || transfer.toMemberId === member.id)
      .map(transfer => {
        const payingOut = transfer.fromMemberId === member.id;
        const other = find(payingOut ? transfer.toMemberId : transfer.fromMemberId);
        return other ? { member: other, amount: round(transfer.amount) } : undefined;
      })
      .filter((row): row is { member: TripMember; amount: number } => Boolean(row)),
  }));
};

/** One bill, read as 「X 先付，Y 和 Z 各欠 N」. */
export const describeExpense = (
  expense: Expense,
  members: TripMember[],
  ownerMemberId?: string,
): ExpenseBreakdown => {
  const find = (id: string) => members.find(member => member.id === id);
  const { responsibility } = calculateExpenseLedger(expense, ownerMemberId);
  const payer = find(expense.payerId);

  /*
    The payer is left out of 應付 even when they share the bill.

    The design reads 「Ann, Brian 應付・各 NT$ 6,250」 — the people who owe money
    because of this bill. Someone paying for their own share owes nobody, and
    listing them makes a split of two look like a split of three.
  */
  const sharers = Object.entries(responsibility)
    .filter(([id, amount]) => Number.isFinite(amount) && amount > 0.5 && id !== expense.payerId)
    .map(([id, amount]) => ({ id, amount }));

  const amounts = sharers.map(sharer => Math.round(sharer.amount));
  const even = amounts.length > 0 && amounts.every(amount => amount === amounts[0]);

  return {
    expense,
    payer,
    owedBy: sharers.map(sharer => find(sharer.id)).filter((member): member is TripMember => Boolean(member)),
    perHead: even ? amounts[0] : undefined,
  };
};
