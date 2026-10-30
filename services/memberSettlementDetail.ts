import { Expense, TripMember } from '../types';
import { SPLIT_TOLERANCE, calculateExpenseLedger, isSplitRelevant } from './splitCalculator';
import { buildMinimumSettlementTransfers } from './minimumSettlement';
import {
  OrphanedParticipant,
  SettlementCounterparty,
  partitionParticipants,
  resolveCounterparty,
} from './settlementParticipants';

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
  /**
   * Who pays them, or whom they pay, and how much.
   *
   * The counterparty may have no row in the member list; the row is kept
   * regardless, because deleting it removes this member's own obligation from
   * their screen while the orphan warning above still reports it. See
   * `SettlementCounterparty`.
   */
  transfers: Array<SettlementCounterparty & { amount: number }>;
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

/**
 * Money on these bills that belongs to somebody not in the member list.
 *
 * The positions below are keyed by member, and a bill can name an id the list
 * does not hold — a companion removed from the trip after the bill was
 * recorded, or a seat this device never learned the name of. That id still
 * paid, or still owes, so its money is real; it simply has no row to sit in.
 *
 * Dropping it is how 「everybody's net sums to zero」 stops being true without
 * anything saying so. `settlementImbalances` cannot catch this: every bill's
 * two sides add up perfectly, and the loss happens afterwards, when the
 * totals are projected onto the members that remain. That is the shape this
 * codebase keeps producing — the failure is made to render instead of being
 * reported — so it is reported.
 *
 * Reporting only. Who the missing traveller is, and what should happen to
 * their share, is the traveller's to say and not a number to invent.
 *
 * The rule itself lives in `settlementParticipants`, which every settlement
 * surface shares. It used to be hand-written here, in `viewerBalances` and in
 * `SettlementFlow` with three different tolerances.
 */
export type UnknownParticipant = OrphanedParticipant;

/** What each member has put in, minus what they have consumed. */
export const buildMemberPositions = (
  expenses: Expense[],
  members: TripMember[],
  ownerMemberId?: string,
): MemberPosition[] => buildPositions(expenses, members, ownerMemberId).positions;

/**
 * Participants on these bills who have no row in the member table.
 *
 * Same computation as the positions, so the two cannot disagree about who is
 * missing — see `UnknownParticipant`.
 */
export const unknownParticipants = (
  expenses: Expense[],
  members: TripMember[],
  ownerMemberId?: string,
): UnknownParticipant[] => buildPositions(expenses, members, ownerMemberId).unknown;

const buildPositions = (
  expenses: Expense[],
  members: TripMember[],
  ownerMemberId?: string,
): { positions: MemberPosition[]; unknown: UnknownParticipant[] } => {
  const net: Record<string, number> = {};
  members.forEach(member => { net[member.id] = 0; });

  expenses.filter(isSplitRelevant).forEach(expense => {
    if (!Number.isFinite(expense.twdAmount)) return;
    const { responsibility, paid } = calculateExpenseLedger(expense, ownerMemberId);
    /*
      A bill nobody is responsible for is nobody's debt.

      Crediting the payer for money no one owes back would show them as 應收 for
      their own spending — and it would break the one invariant this page rests
      on, that everybody's net sums to zero.
    */
    if (Object.keys(responsibility).length === 0) return;
    Object.entries(paid).forEach(([id, amount]) => {
      if (Number.isFinite(amount)) net[id] = (net[id] || 0) + amount;
    });
    Object.entries(responsibility).forEach(([id, amount]) => {
      if (Number.isFinite(amount)) net[id] = (net[id] || 0) - amount;
    });
  });

  const transfers = buildMinimumSettlementTransfers(net);
  /*
    One partition for both halves of the screen, and one rounding
    reconciliation — so the members' nets sum to zero when the raw figures do,
    and the orphan warning names exactly the ids the transfer rows mark absent.
  */
  const { known, orphaned: unknown } = partitionParticipants(net, members);

  const positions = members.map(member => ({
    member,
    net: known[member.id] || 0,
    /*
      Every transfer touching this member, counterparty resolved but never
      required. A transfer naming somebody with no row is still money this
      member owes or is owed; dropping it was how the amber notice above and
      the row below came to describe different settlements.
    */
    transfers: transfers
      .filter(transfer => transfer.fromMemberId === member.id || transfer.toMemberId === member.id)
      .map(transfer => {
        const payingOut = transfer.fromMemberId === member.id;
        const other = payingOut ? transfer.toMemberId : transfer.fromMemberId;
        return { ...resolveCounterparty(other, members), amount: round(transfer.amount) };
      }),
  }));

  return { positions, unknown };
};

/**
 * A bill whose two sides do not agree.
 *
 * 「為何這兩個數字不一樣」 — 應付 NT$894 against 應收 NT$890. Everybody's net
 * must sum to zero; that is the one invariant this whole page rests on, and
 * it had been quietly broken by four dollars.
 *
 * It breaks when a single bill's 「who paid」 and 「who owes」 do not add up to
 * the same money, and the calculator permits that on purpose:
 * `normalizePayerAllocations` returns stored amounts untouched when they miss
 * the total by more than `SPLIT_TOLERANCE`, and EXACT shares are never
 * rescaled. Both are the right call — the app must not silently rewrite
 * somebody's figures — but neither told anyone.
 *
 * So this asks the invariant's own question of each bill, which is why it
 * lives here beside the positions rather than in the calculator: it covers
 * both sides at once, where `detectAllocationIssue` only inspects the
 * responsibility side and would have missed a payer split that does not add
 * up.
 *
 * Reporting only. Whose number is wrong is the traveller's to say.
 */
export interface SettlementImbalance {
  expense: Expense;
  /** What the payers are recorded as having put in. */
  paid: number;
  /** What the sharers are recorded as owing. */
  owed: number;
  /** `paid - owed`, rounded. Positive means more was paid than anyone owes. */
  difference: number;
}

export const settlementImbalances = (
  expenses: Expense[],
  ownerMemberId?: string,
): SettlementImbalance[] => expenses
  .filter(isSplitRelevant)
  .filter(expense => Number.isFinite(expense.twdAmount))
  .map(expense => {
    const { responsibility, paid } = calculateExpenseLedger(expense, ownerMemberId);
    /* A bill nobody is responsible for is nobody's debt; see above. */
    if (Object.keys(responsibility).length === 0) return undefined;
    const paidTotal = Object.values(paid).reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0);
    const owedTotal = Object.values(responsibility).reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0);
    const difference = round(paidTotal - owedTotal);
    if (Math.abs(difference) <= SPLIT_TOLERANCE) return undefined;
    return { expense, paid: round(paidTotal), owed: round(owedTotal), difference };
  })
  .filter((entry): entry is SettlementImbalance => entry !== undefined);

/**
 * The bills this settlement is actually about.
 *
 * 「這個支出沒有分帳的問題 是對方個人的支出 就不應出現在分帳結算表格」. A bill
 * somebody paid for themselves settles nothing: it moves no money between
 * anyone, and it was listed on a page about who owes whom reading 「自己的支出」.
 * It is still their expense and still in their own ledger — it is just not part
 * of this conversation.
 */
export const settlementExpenses = (
  expenses: Expense[],
  members: TripMember[],
  ownerMemberId?: string,
): Expense[] =>
  expenses.filter(expense => describeExpense(expense, members, ownerMemberId).owedBy.length > 0);

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
