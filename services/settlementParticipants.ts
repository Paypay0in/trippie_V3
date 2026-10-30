import { TripMember } from '../types';
import { SPLIT_TOLERANCE } from './splitCalculator';

/**
 * One home for 「對方不在成員名單裡」 and for the cent that rounding creates.
 *
 * Every settlement surface asks the same two questions of the same net map:
 * which of these ids has a row in the member list, and what do the amounts
 * look like once they are rounded for display. Three callers used to answer
 * them separately — `SettlementFlow` with a literal `0.5`, `viewerBalances`
 * with its own `SETTLED_TOLERANCE`, `memberSettlementDetail` with
 * `SPLIT_TOLERANCE` — each building its own map. Nothing made the three agree.
 *
 * The independent reviewer (CGX-20261029-001) found what that costs inside the
 * fix that was meant to address it: one surface reported an orphaned
 * participant in a warning while another deleted every transfer naming them,
 * so two halves of a single screen described different settlements. Reporting
 * the loss in one place and swallowing it in two others is a fourth home for
 * the question, not a repair. A rule with two homes is a rule with two
 * answers, and the day it disagrees with itself is the day somebody loses
 * money.
 *
 * So: one tolerance, one partition, one rounding reconciliation, one
 * counterparty lookup that cannot drop an amount. Callers render.
 */

/**
 * Below this, a balance is rounding noise rather than a debt.
 *
 * Re-exported from the calculator rather than redeclared, so 「what counts as
 * settled」 has a single value across splitting and settlement both.
 */
export const SETTLEMENT_TOLERANCE = SPLIT_TOLERANCE;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Money on these bills that belongs to somebody not in the member list.
 *
 * A bill can name an id the list does not hold — a companion removed from the
 * trip after the bill was recorded, or a seat this device never learned the
 * name of. That id still paid, or still owes, so its money is real; it simply
 * has no row to sit in.
 *
 * Reporting only. Who the missing traveller is, and what should happen to
 * their share, is the traveller's to say and not a number to invent.
 */
export interface OrphanedParticipant {
  memberId: string;
  /** Their net across these bills: positive is owed to them. */
  net: number;
}

/**
 * A counterparty named by a transfer, resolved against the member list.
 *
 * `member` is absent when the list does not hold the id. The id is carried
 * either way, because the alternative — dropping the row — is how an
 * obligation disappears from the screen of the person who owes it.
 */
export interface SettlementCounterparty {
  memberId: string;
  member?: TripMember;
}

/**
 * Rounded nets whose displayed sum is not thrown off by rounding alone.
 *
 * Each member's net is rounded for display independently, so a split that sums
 * to zero in full precision need not sum to zero once rounded: 1000 three ways
 * is 666.67 / −333.33 / −333.33, which reads as +0.01. That is under every
 * tolerance in the codebase, so the one invariant the settlement page rests on
 * was off by a cent with nothing on screen to say so — a clamp at the edge of
 * a calculation turning a failure into something that renders.
 *
 * The residue is pushed onto the largest-magnitude position, which is the one
 * whose figure a cent moves least in relative terms.
 *
 * Only the rounding residue is reconciled. A genuine imbalance — 894 paid
 * against 890 owed — is left exactly where it is, for `settlementImbalances`
 * to report; this must never become a place where a real defect is quietly
 * absorbed.
 */
export const reconcileRoundedNets = (
  net: Record<string, number>,
): Record<string, number> => {
  const entries = Object.entries(net).filter(([, amount]) => Number.isFinite(amount));
  const rounded: Record<string, number> = {};
  entries.forEach(([id, amount]) => { rounded[id] = round(amount); });

  const rawSum = entries.reduce((sum, [, amount]) => sum + amount, 0);
  const roundedSum = entries.reduce((sum, [id]) => sum + rounded[id], 0);
  /*
    What rounding alone introduced, isolated from any real imbalance: the
    difference between the two sums, with the raw sum itself rounded away.
    A four-dollar hole survives this subtraction untouched.
  */
  const residue = round(roundedSum - round(rawSum));
  if (residue === 0 || entries.length === 0) return rounded;

  const anchor = entries.reduce(
    (largest, entry) => (Math.abs(entry[1]) > Math.abs(largest[1]) ? entry : largest),
    entries[0],
  );
  rounded[anchor[0]] = round(rounded[anchor[0]] - residue);
  return rounded;
};

/**
 * The net map split into ids the member list holds and ids it does not.
 *
 * Both halves come from the same reconciled map, so no surface can report an
 * orphan the next one has rounded out of existence.
 */
export const partitionParticipants = (
  net: Record<string, number>,
  members: TripMember[],
): { known: Record<string, number>; orphaned: OrphanedParticipant[] } => {
  const rounded = reconcileRoundedNets(net);
  const known: Record<string, number> = {};
  members.forEach(member => { known[member.id] = rounded[member.id] || 0; });

  const held = new Set(members.map(member => member.id));
  const orphaned = Object.entries(rounded)
    .filter(([id, amount]) => !held.has(id) && Math.abs(amount) > SETTLEMENT_TOLERANCE)
    .map(([memberId, net]) => ({ memberId, net }));

  return { known, orphaned };
};

/**
 * Who a transfer names, without inventing a name for an id with no row.
 *
 * The callers used to do this with `find()` plus `.filter(Boolean)`, which
 * deletes the transfer when the counterparty is absent — and with it the
 * obligation of the member who is still here and still owes the money.
 */
export const resolveCounterparty = (
  memberId: string,
  members: TripMember[],
): SettlementCounterparty => ({
  memberId,
  member: members.find(member => member.id === memberId),
});

/** Whether a rounded amount is a debt rather than rounding noise. */
export const isOutstanding = (amount: number): boolean =>
  Number.isFinite(amount) && Math.abs(amount) > SETTLEMENT_TOLERANCE;
