import { TripMember } from '../types';
import { buildMinimumSettlementTransfers } from './minimumSettlement';
import { isOutstanding, resolveCounterparty } from './settlementParticipants';

/**
 * "Who owes whom" from one member's seat.
 *
 * Settlement stores an absolute net balance per member. That only reads as
 * "owes me" from the trip owner's position: with three or more members, A's net
 * balance says nothing about what A owes *me*. Every screen that rendered those
 * numbers directly told a non-owner the opposite of the truth — the same bug
 * was fixed twice, in two components, because each derived this on its own.
 *
 * This is the one place that answers the question. Screens render the result.
 */

/**
 * Negative: they owe the viewer. Positive: the viewer owes them.
 *
 * `member` is absent when the balance names an id the member list does not
 * hold. The row is kept anyway: a balance belonging to a departed companion is
 * still money, and filtering it out here made these totals quietly smaller
 * than the ones 成員結算明細 was warning about. 「What counts as settled」 and
 * 「what to do with an id that has no row」 both live in
 * `settlementParticipants` now, shared with every other settlement surface.
 */
export interface ViewerBalanceRow {
  memberId: string;
  member?: TripMember;
  amount: number;
}

export const buildViewerBalanceRows = ({
  debts,
  members,
  ownerMemberId,
  viewerMemberId,
}: {
  debts: Record<string, number>;
  members: TripMember[];
  ownerMemberId?: string;
  /** Defaults to the owner, which is the single-user case. */
  viewerMemberId?: string;
}): ViewerBalanceRow[] => {
  const viewerId = viewerMemberId || ownerMemberId;
  const viewerIsOwner = !viewerId || !ownerMemberId || viewerId === ownerMemberId;

  if (viewerIsOwner) {
    // The owner is the counterparty of every stored balance, so each member's
    // own net amount already reads from their seat.
    return (Object.entries(debts) as [string, number][])
      .filter(([id, amount]) => id !== ownerMemberId && isOutstanding(amount))
      .map(([id, amount]) => ({ ...resolveCounterparty(id, members), amount }));
  }

  // For anyone else the pairwise transfer plan is what actually names a
  // counterparty and an amount between the two of them.
  return buildMinimumSettlementTransfers(debts)
    .filter(
      transfer =>
        transfer.fromMemberId === viewerId || transfer.toMemberId === viewerId,
    )
    .map(transfer => {
      const isPaying = transfer.fromMemberId === viewerId;
      const counterpartId = isPaying ? transfer.toMemberId : transfer.fromMemberId;
      return {
        ...resolveCounterparty(counterpartId, members),
        amount: isPaying ? transfer.amount : -transfer.amount,
      };
    });
};

/** Total the viewer is owed. */
export const sumReceivable = (rows: ViewerBalanceRow[]): number =>
  rows.filter(row => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);

/** Total the viewer has to pay. */
export const sumPayable = (rows: ViewerBalanceRow[]): number =>
  rows.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);

export const countReceivable = (rows: ViewerBalanceRow[]): number =>
  rows.filter(row => row.amount < 0).length;

export const countPayable = (rows: ViewerBalanceRow[]): number =>
  rows.filter(row => row.amount > 0).length;
