import { Expense, TripMember } from '../types';
import { calculateExpenseLedger } from './splitCalculator';

/**
 * What one row of the ledger says about who paid and who carries it.
 *
 * 「將帳目的這個介面 100% 改成我圖上的樣子」. The design asks each row to answer
 * three things at a glance — what it was, who fronted it, and whether it is
 * anything to do with you — where the list previously showed a category glyph
 * and a payment-method chip, neither of which is in question while you are
 * scanning for a bill you remember by its photograph.
 */

export interface ExpenseRowSummary {
  /** The person who put the money down. */
  payer?: TripMember;
  /** Everyone the bill touches, payer first, for the avatar strip. */
  involved: TripMember[];
  /** True when the viewer paid and nobody else is on it. */
  isPersonal: boolean;
  /**
   * How many people carry a share of this bill.
   *
   * Counted from the split itself rather than from the resolved members: a
   * traveller whose record is missing still carries their half, and gating the
   * 「分帳・你」 figure on having their name would hide what the bill cost the
   * reader for a reason that has nothing to do with the money.
   */
  sharerCount: number;
  /** What it cost the viewer, when the app knows who they are. */
  viewerShare?: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export const summariseExpenseRow = (
  expense: Expense,
  members: TripMember[],
  viewerMemberId?: string,
  tripOwnerMemberId?: string,
): ExpenseRowSummary => {
  const find = (id?: string) => (id ? members.find(member => member.id === id) : undefined);
  const payer = find(expense.payerId);

  const { responsibility } = Number.isFinite(expense.twdAmount)
    ? calculateExpenseLedger(expense, tripOwnerMemberId)
    : { responsibility: {} as Record<string, number> };

  const carrying = Object.keys(responsibility).filter(id => Number.isFinite(responsibility[id]) && responsibility[id] > 0.5);

  /*
    The payer leads the strip, then everyone else carrying a share.

    Ordering matters on a row this narrow: the first avatar is the one read,
    and the person who paid is the one the row is about.
  */
  const involved = [
    ...(payer ? [payer] : []),
    ...carrying.filter(id => id !== expense.payerId).map(find).filter((member): member is TripMember => Boolean(member)),
  ];

  /*
    A bill you paid that nobody shares.

    「我自己付・不分帳」 — it belongs in your own ledger and in no settlement, and
    the design marks it so it reads as a personal expense rather than as a split
    one whose other half has gone missing.
  */
  const isPersonal = Boolean(
    viewerMemberId
    && expense.payerId === viewerMemberId
    && carrying.every(id => id === viewerMemberId),
  );

  const share = viewerMemberId ? responsibility[viewerMemberId] : undefined;

  return {
    payer,
    involved,
    isPersonal,
    sharerCount: carrying.length,
    viewerShare: Number.isFinite(share) ? round(share as number) : undefined,
  };
};

/** The initial shown in an avatar circle. */
export const initialOf = (member: TripMember): string => (member.name || '?').trim().charAt(0).toUpperCase();

/** A stable colour per member, so the same person reads the same in every row. */
export const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-slate-200 text-slate-700',
  'bg-orange-100 text-orange-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
];

export const toneForMember = (members: TripMember[], memberId: string): string =>
  AVATAR_TONES[Math.max(0, members.findIndex(member => member.id === memberId)) % AVATAR_TONES.length];
