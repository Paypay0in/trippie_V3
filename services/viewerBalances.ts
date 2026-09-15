import { TripMember } from '../types';
import { buildMinimumSettlementTransfers } from './minimumSettlement';

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

/** Negative: they owe the viewer. Positive: the viewer owes them. */
export interface ViewerBalanceRow {
  member: TripMember;
  amount: number;
}

/** Below this, a balance is rounding noise rather than a debt. */
const SETTLED_TOLERANCE = 0.5;

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
  const findMember = (id: string) => members.find(member => member.id === id);

  if (viewerIsOwner) {
    // The owner is the counterparty of every stored balance, so each member's
    // own net amount already reads from their seat.
    return (Object.entries(debts) as [string, number][])
      .filter(([id, amount]) => id !== ownerMemberId && Math.abs(amount) > SETTLED_TOLERANCE)
      .map(([id, amount]) => ({ member: findMember(id), amount }))
      .filter((row): row is ViewerBalanceRow => Boolean(row.member));
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
        member: findMember(counterpartId),
        amount: isPaying ? transfer.amount : -transfer.amount,
      };
    })
    .filter((row): row is ViewerBalanceRow => Boolean(row.member));
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
