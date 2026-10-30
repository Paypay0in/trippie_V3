/**
 * 「對方不在成員名單裡」 has one answer, and the cent that rounding creates is
 * reported rather than absorbed into a total nobody checks.
 *
 * The independent reviewer (CGX-20261029-001) found the first of these against
 * the settlement fix itself: `buildMemberPositions` reported an orphaned
 * participant in a warning and, in the same render, dropped every transfer
 * naming that participant out of the member rows. The two halves of one screen
 * described different settlements — the amber notice said a departed traveller
 * was owed 300 while that member's own transfer list said they owed nobody.
 *
 * Reading the repo afterwards showed the rule had three hand-written homes with
 * three separate tolerances — `SettlementFlow` at a literal `0.5`,
 * `viewerBalances` at `SETTLED_TOLERANCE`, `memberSettlementDetail` at
 * `SPLIT_TOLERANCE` — each building its own net map. Reporting the loss on one
 * surface while two others swallow it is not a fix; it is a fourth home for the
 * same question. So the rule is extracted and these tests pin it there.
 *
 * The rounding finding is the same shape one layer down: a clamp at the edge of
 * a calculation turning a failure into something that renders. 1000 split three
 * ways rounds to 666.67 / −333.33 / −333.33, which displays a sum of +0.01 —
 * under every tolerance, so nothing says the page's one invariant is off.
 */
import { describe, expect, it } from 'vitest';
import {
  SETTLEMENT_TOLERANCE,
  partitionParticipants,
  reconcileRoundedNets,
  resolveCounterparty,
} from '../services/settlementParticipants';
import { buildMemberPositions, unknownParticipants } from '../services/memberSettlementDetail';
import { buildViewerBalanceRows } from '../services/viewerBalances';
import { Category, Expense, TripMember } from '../types';

const ANN = 'trip:owner';
const SHERRY = 'seat-sherry';
/** A companion removed from the trip after the bill was recorded. */
const REMOVED = 'seat-removed';

const members: TripMember[] = [
  { id: ANN, name: 'Ann', type: 'owner' },
  { id: SHERRY, name: 'Sherry', type: 'guest' },
];

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.OTHER, phase: 'during', date: '2026-10-01',
  payerId: ANN, beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

describe('the tolerance', () => {
  it('is one value, not one per caller', () => {
    expect(SETTLEMENT_TOLERANCE).toBe(0.5);
  });
});

describe('a participant with no row in the member list', () => {
  /* Ann fronted 900 for three; 300 of it belongs to the removed companion. */
  const TAXI = bill({
    id: 'e-taxi', description: 'Tokyo taxi', twdAmount: 900, amount: 900,
    payerId: ANN, beneficiaries: [ANN, SHERRY, REMOVED],
  });

  it('is reported by the shared rule, with their net intact', () => {
    const { orphaned } = partitionParticipants({ [ANN]: 600, [SHERRY]: -300, [REMOVED]: -300 }, members);

    expect(orphaned).toEqual([{ memberId: REMOVED, net: -300 }]);
  });

  it('is not reported when the amount is rounding noise', () => {
    const { orphaned } = partitionParticipants({ [ANN]: 0.2, [REMOVED]: -0.2 }, members);

    expect(orphaned).toEqual([]);
  });

  /*
    The reviewer's finding. `find()` over `members` returned undefined for the
    orphan and `.filter(Boolean)` deleted the whole transfer, so the member who
    owes that money saw no obligation at all.
  */
  it('still appears in the transfer rows of the member who owes them', () => {
    const sherry = buildMemberPositions([TAXI], members, ANN)
      .find(position => position.member.id === SHERRY);

    // Sherry owes 300. Whoever the counterparty is, the obligation is shown.
    expect(sherry?.net).toBeCloseTo(-300, 0);
    const total = (sherry?.transfers || []).reduce((sum, row) => sum + row.amount, 0);
    expect(total).toBeCloseTo(300, 0);
  });

  it('is named as absent in that row rather than resolved to a member', () => {
    const rows = buildMemberPositions([TAXI], members, ANN)
      .flatMap(position => position.transfers);
    const absent = rows.filter(row => !row.member);

    expect(absent.length).toBeGreaterThan(0);
    // The id is carried so the screen can say who, and no name is invented.
    expect(absent.every(row => row.memberId === REMOVED)).toBe(true);
  });

  it('is the same id the warning reports, so the two halves agree', () => {
    const warned = unknownParticipants([TAXI], members, ANN).map(entry => entry.memberId);
    const inRows = buildMemberPositions([TAXI], members, ANN)
      .flatMap(position => position.transfers)
      .filter(row => !row.member)
      .map(row => row.memberId);

    expect(new Set(inRows)).toEqual(new Set(warned));
  });

  it('is reported by the viewer balance rows too, not silently dropped', () => {
    const rows = buildViewerBalanceRows({
      debts: { [ANN]: 600, [SHERRY]: -300, [REMOVED]: -300 },
      members,
      ownerMemberId: ANN,
    });

    expect(rows.some(row => row.memberId === REMOVED && !row.member)).toBe(true);
  });

  it('leaves the viewer rows summing to the whole debt, not the placeable part', () => {
    const rows = buildViewerBalanceRows({
      debts: { [ANN]: 600, [SHERRY]: -300, [REMOVED]: -300 },
      members,
      ownerMemberId: ANN,
    });
    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    expect(total).toBeCloseTo(-600, 2);
  });
});

describe('the cent that rounding creates', () => {
  it('is not left in the displayed total', () => {
    /* 1000 three ways: 666.666…, −333.333…, −333.333… */
    const raw = { [ANN]: 2000 / 3, [SHERRY]: -1000 / 3, [REMOVED]: -1000 / 3 };
    const rounded = reconcileRoundedNets(raw);
    const total = Object.values(rounded).reduce((sum, amount) => sum + amount, 0);

    expect(total).toBeCloseTo(0, 6);
  });

  it('is absorbed by the largest position, so no small debt is reshaped', () => {
    const rounded = reconcileRoundedNets({ [ANN]: 2000 / 3, [SHERRY]: -1000 / 3, [REMOVED]: -1000 / 3 });

    expect(rounded[SHERRY]).toBeCloseTo(-333.33, 2);
    expect(rounded[REMOVED]).toBeCloseTo(-333.33, 2);
    expect(rounded[ANN]).toBeCloseTo(666.66, 2);
  });

  it('never hides a real imbalance by reconciling it away', () => {
    /* Four dollars missing is a defect, not rounding; it must survive. */
    const rounded = reconcileRoundedNets({ [ANN]: 894, [SHERRY]: -890 });
    const total = Object.values(rounded).reduce((sum, amount) => sum + amount, 0);

    expect(total).toBeCloseTo(4, 2);
  });

  it('leaves the rendered member nets summing to zero on a three-way split', () => {
    const SPLIT = bill({
      id: 'e-ramen', description: 'ramen', twdAmount: 1000, amount: 1000,
      payerId: ANN, beneficiaries: [ANN, SHERRY, REMOVED],
    });
    const everyone = [...members, { id: REMOVED, name: 'Gina', type: 'guest' } as TripMember];
    const total = buildMemberPositions([SPLIT], everyone, ANN)
      .reduce((sum, position) => sum + position.net, 0);

    expect(total).toBe(0);
  });
});

describe('resolveCounterparty', () => {
  it('returns the member when the list holds the id', () => {
    expect(resolveCounterparty(SHERRY, members)).toEqual({ memberId: SHERRY, member: members[1] });
  });

  it('returns the id alone when it does not, inventing no name', () => {
    expect(resolveCounterparty(REMOVED, members)).toEqual({ memberId: REMOVED, member: undefined });
  });
});
