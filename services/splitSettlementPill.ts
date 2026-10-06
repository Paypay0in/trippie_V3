import { TripMember } from '../types';
import { ExpenseRowSummary } from './expenseRowSummary';

/**
 * What a split row owes, and to whom, in the words the design puts on it.
 *
 * 「用這個新的UI 百分之百還原設計」. The ledger row ends in a pill carrying the
 * other traveller's initial and one of two sentences — 「應付你 NT$ 264」 or
 * 「需付給朋友 NT$ 948」 — which is a far more direct answer than the 「分帳・你
 * $264」 it replaces: that one said what the bill cost the reader without ever
 * saying which direction the money still has to move.
 *
 * The direction follows the ledger, not the layout. Whoever fronted the money
 * is owed by everybody else on the bill; everybody else owes their own share.
 */

export type SettlementDirection = 'owed_to_viewer' | 'viewer_owes';

export interface SettlementPill {
  direction: SettlementDirection;
  /** Already rounded, because the pill shows whole dollars. */
  amount: number;
  /** The person on the other side of it, for the avatar and the wording. */
  counterpart?: TripMember;
  /** The full sentence, as the design writes it. */
  label: string;
}

const round = (value: number) => Math.round(value);

/**
 * The pill for one row, or nothing when there is no debt to describe.
 *
 * Silent on a bill nobody shares, on one the reader has no part in, and on a
 * settled-to-zero share: a pill reading 「應付你 NT$ 0」 is a row of furniture
 * saying nothing, and the design has no such state.
 */
export const settlementPillFor = ({
  summary,
  netAmount,
  viewerMemberId,
}: {
  summary: ExpenseRowSummary;
  /** What the bill came to, after anything already refunded on it. */
  netAmount: number;
  viewerMemberId?: string;
}): SettlementPill | undefined => {
  const { payer, involved, isPersonal, sharerCount, viewerShare } = summary;
  if (isPersonal || sharerCount < 2 || !viewerMemberId) return undefined;

  const viewerPaid = Boolean(payer && payer.id === viewerMemberId);

  if (viewerPaid) {
    /*
      They fronted it, so everyone else's share is owed back to them.

      Taken as 「the bill minus my own share」 rather than by summing the other
      rows: those two agree, and the subtraction cannot drift when a share is
      rounded.
    */
    const owed = round(netAmount - (viewerShare ?? 0));
    if (owed <= 0) return undefined;
    const counterpart = involved.find(member => member.id !== viewerMemberId);
    return {
      direction: 'owed_to_viewer',
      amount: owed,
      counterpart,
      label: `應付你 NT$ ${owed.toLocaleString()}`,
    };
  }

  const owes = round(viewerShare ?? 0);
  if (owes <= 0) return undefined;
  /*
    Named rather than generic where the roster knows them.

    「需付給朋友」 is what the design shows for a companion with no name on this
    device; a name is strictly better when there is one, and it is the same
    sentence either way.
  */
  const name = payer?.name?.trim();
  return {
    direction: 'viewer_owes',
    amount: owes,
    counterpart: payer,
    label: `需付給${name || '朋友'} NT$ ${owes.toLocaleString()}`,
  };
};
