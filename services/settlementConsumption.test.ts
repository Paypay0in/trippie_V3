import { describe, it, expect } from 'vitest';
import { Category, Expense, PaymentMethod, SettlementBatch, TripMember } from '../types';
import {
  calculateOutstandingDebts,
  collectLegacySettledExpenseIds,
  collectSettlementAccountingIssues,
  collectSettledPairs,
  filterOutstandingExpenses,
  outstandingMemberIds,
} from './settlementConsumption';
import { calculateTripDebts } from './splitCalculator';

const OWNER = 'trip-1:owner';
const GINA = 'companion-gina';
const V = 'companion-v';

const members: TripMember[] = [
  { id: OWNER, name: '我', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
  { id: V, name: 'V', type: 'guest' },
];

const expense = (overrides: Partial<Expense> = {}): Expense => ({
  id: 'hotel',
  description: '飯店',
  amount: 9000,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 9000,
  category: Category.ACCOMMODATION,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'during',
  date: '2026-09-12',
  payerId: OWNER,
  beneficiaries: [OWNER, GINA, V],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  handlingFee: 0,
  needsReview: false,
  ...overrides,
});

const batch = (overrides: Partial<SettlementBatch> = {}): SettlementBatch => ({
  id: 'b1',
  tripId: 'trip-1',
  title: 'Day 1',
  expenseIds: ['hotel'],
  memberIds: [GINA],
  status: 'settled',
  createdAt: '2026-09-12T00:00:00.000Z',
  ...overrides,
});

const hotel = expense();

describe('batch format classification', () => {
  it('only memberIdsKind === "targets" yields pairs — never owner presence', () => {
    const marked = batch({ memberIdsKind: 'targets' });
    expect(collectSettledPairs([marked], OWNER).size).toBe(1);

    // 3. A legacy-style batch that happens to omit the owner must NOT be read
    //    as target-only. Owner absence carries no meaning.
    const legacyWithoutOwner = batch({ memberIds: [GINA, V] });
    expect(collectSettledPairs([legacyWithoutOwner], OWNER).size).toBe(0);
    expect(collectLegacySettledExpenseIds([legacyWithoutOwner]).has('hotel')).toBe(true);
  });

  it('open batches settle nothing, in either format', () => {
    expect(collectSettledPairs([batch({ memberIdsKind: 'targets', status: 'open' })], OWNER).size).toBe(0);
    expect(collectLegacySettledExpenseIds([batch({ status: 'open' })]).size).toBe(0);
  });

  it('owner aliases inside memberIds normalize to the canonical owner', () => {
    const marked = batch({ memberIdsKind: 'targets', memberIds: ['me'] });
    expect([...collectSettledPairs([marked], OWNER)][0]).toContain(OWNER);
  });
});

describe('1. target-only batch settles Gina and keeps V outstanding', () => {
  const settledGina = [batch({ memberIdsKind: 'targets', memberIds: [GINA] })];

  it('V still owes 3000 and the owner is still owed exactly that', () => {
    const debts = calculateOutstandingDebts([hotel], members, settledGina);
    expect(debts[GINA]).toBe(0);
    expect(debts[V]).toBe(-3000);
    expect(debts[OWNER]).toBe(3000);
    // Conservation: nothing invented, nothing lost.
    expect(Object.values(debts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('the expense stays outstanding, and V stays a reachable target', () => {
    expect(filterOutstandingExpenses([hotel], members, settledGina).map(e => e.id)).toEqual(['hotel']);
    expect(outstandingMemberIds(hotel, members, settledGina)).toEqual([V]);
  });

  it('settling V too retires the expense', () => {
    const both = [batch({ memberIdsKind: 'targets', memberIds: [GINA, V] })];
    expect(outstandingMemberIds(hotel, members, both)).toEqual([]);
    expect(filterOutstandingExpenses([hotel], members, both)).toEqual([]);
    expect(calculateOutstandingDebts([hotel], members, both)).toEqual({ [OWNER]: 0, [GINA]: 0, [V]: 0 });
  });
});

describe('2. legacy unmarked batch retains whole-expense settlement', () => {
  const legacy = [batch({ memberIds: [OWNER, GINA, V] })];

  it('the whole expense drops out for everyone, exactly as before', () => {
    expect(filterOutstandingExpenses([hotel], members, legacy)).toEqual([]);
    expect(calculateOutstandingDebts([hotel], members, legacy)).toEqual({ [OWNER]: 0, [GINA]: 0, [V]: 0 });
  });

  it('a legacy batch naming only Gina still retires the whole expense', () => {
    const legacyGinaOnly = [batch({ memberIds: [GINA] })];
    expect(calculateOutstandingDebts([hotel], members, legacyGinaOnly)[V]).toBe(0);
  });
});

describe('4. EQUAL denominator stays on the original beneficiaries', () => {
  it("settling Gina never inflates V's share from 3000 to 4500", () => {
    const debts = calculateOutstandingDebts(
      [hotel],
      members,
      [batch({ memberIdsKind: 'targets', memberIds: [GINA] })],
    );
    expect(debts[V]).toBe(-3000);
    expect(debts[V]).not.toBe(-4500);
  });

  it('an unsettled ledger matches the plain calculator exactly', () => {
    expect(calculateOutstandingDebts([hotel], members, [])).toEqual(calculateTripDebts([hotel], members));
  });
});

describe('5. EXACT and PERCENT responsibilities are unchanged before subtraction', () => {
  const exact = expense({
    id: 'dinner',
    twdAmount: 1000,
    amount: 1000,
    splitMethod: 'EXACT',
    splitAllocations: { [OWNER]: 500, [GINA]: 300, [V]: 200 },
  });
  const percent = expense({
    id: 'taxi',
    twdAmount: 1000,
    amount: 1000,
    splitMethod: 'PERCENT',
    splitAllocations: { [OWNER]: 500, [GINA]: 300, [V]: 200 },
  });

  it('EXACT: settling Gina removes 300 and nothing else', () => {
    const before = calculateOutstandingDebts([exact], members, []);
    expect(before[GINA]).toBe(-300);
    expect(before[V]).toBe(-200);

    const after = calculateOutstandingDebts(
      [exact],
      members,
      [batch({ expenseIds: ['dinner'], memberIds: [GINA], memberIdsKind: 'targets' })],
    );
    expect(after[GINA]).toBe(0);
    expect(after[V]).toBe(-200);
    expect(after[OWNER]).toBe(200);
  });

  it('PERCENT: the same, with allocations resolved first', () => {
    const after = calculateOutstandingDebts(
      [percent],
      members,
      [batch({ expenseIds: ['taxi'], memberIds: [V], memberIdsKind: 'targets' })],
    );
    expect(after[V]).toBe(0);
    expect(after[GINA]).toBe(-300);
    expect(after[OWNER]).toBe(300);
  });
});

describe('6. mixed legacy and target-marked batches are deterministic', () => {
  const dinner = expense({ id: 'dinner', twdAmount: 3000, amount: 3000 });
  const batches = [
    batch({ id: 'legacy', expenseIds: ['dinner'], memberIds: [OWNER, GINA, V] }),
    batch({ id: 'marked', expenseIds: ['hotel'], memberIds: [GINA], memberIdsKind: 'targets' }),
  ];

  it('each expense follows its own batch format', () => {
    expect(filterOutstandingExpenses([hotel, dinner], members, batches).map(e => e.id)).toEqual(['hotel']);

    const debts = calculateOutstandingDebts([hotel, dinner], members, batches);
    // dinner: gone entirely (legacy). hotel: Gina settled, V outstanding.
    expect(debts[GINA]).toBe(0);
    expect(debts[V]).toBe(-3000);
    expect(debts[OWNER]).toBe(3000);
  });

  it('order of the batches does not change the result', () => {
    expect(calculateOutstandingDebts([hotel, dinner], members, batches)).toEqual(
      calculateOutstandingDebts([hotel, dinner], members, [...batches].reverse()),
    );
  });
});

describe('multi-payer credit is reduced in proportion to what each payer paid', () => {
  it('a settled share repays each payer pro rata', () => {
    const shared = expense({
      id: 'shared',
      twdAmount: 900,
      amount: 900,
      payerAllocations: { [OWNER]: 600, [V]: 300 },
      beneficiaries: [OWNER, GINA, V],
    });
    const after = calculateOutstandingDebts(
      [shared],
      members,
      [batch({ expenseIds: ['shared'], memberIds: [GINA], memberIdsKind: 'targets' })],
    );
    // Gina's 300 repaid 2/3 to owner and 1/3 to V.
    expect(after[GINA]).toBe(0);
    expect(after[OWNER]).toBe(100);
    expect(after[V]).toBe(-100);
    expect(Object.values(after).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
  });
});

describe('7. the marker survives persistence as plain JSON', () => {
  it('round-trips through serialization, and absence stays absent', () => {
    const marked = batch({ memberIdsKind: 'targets' });
    const reloaded = JSON.parse(JSON.stringify([marked, batch({ id: 'old' })])) as SettlementBatch[];

    expect(reloaded[0].memberIdsKind).toBe('targets');
    expect(reloaded[1].memberIdsKind).toBeUndefined();
    expect(collectSettledPairs(reloaded, OWNER).size).toBe(1);
    expect(collectLegacySettledExpenseIds(reloaded).has('hotel')).toBe(true);
  });
});

describe('payer / target overlap (Founder rule)', () => {
  const A = OWNER;
  const B = GINA;
  const twoPayers = expense({
    id: 'overlap',
    twdAmount: 100,
    amount: 100,
    payerId: A,
    payerAllocations: { [A]: 80, [B]: 20 },
    beneficiaries: [A, B],
  });
  const settleB = [batch({ expenseIds: ['overlap'], memberIds: [B], memberIdsKind: 'targets' })];

  it('A paid 80 / B paid 20, each owes 50, B settled -> both zero', () => {
    const debts = calculateOutstandingDebts([twoPayers], members, settleB);
    expect(debts[A]).toBe(0);
    expect(debts[B]).toBe(0);
    // The rejected behaviour: part of B's discharge handed back to B as payer credit.
    expect(debts[A]).not.toBe(-10);
    expect(debts[B]).not.toBe(10);
  });

  it('no part of a settled member’s discharge returns to them as payer credit', () => {
    const debts = calculateOutstandingDebts([twoPayers], members, settleB);
    expect(debts[B]).toBe(0);
    expect(Object.values(debts).reduce((a, b) => a + b, 0)).toBe(0);
    expect(collectSettlementAccountingIssues([twoPayers], members, settleB)).toEqual([]);
  });

  it('a settled member who over-paid still nets to zero, and the rest lands on other payers', () => {
    // A paid 20, B paid 80, each owes 50: B is owed 30. Settling B clears it.
    const bOverpaid = expense({
      id: 'overpaid',
      twdAmount: 100,
      amount: 100,
      payerId: B,
      payerAllocations: { [A]: 20, [B]: 80 },
      beneficiaries: [A, B],
    });
    const debts = calculateOutstandingDebts(
      [bOverpaid],
      members,
      [batch({ expenseIds: ['overpaid'], memberIds: [B], memberIdsKind: 'targets' })],
    );
    expect(debts[B]).toBe(0);
    expect(debts[A]).toBe(0);
  });
});

describe('totalPaid === 0 (Founder rule)', () => {
  it('zero discharge against zero paid is a no-op, not an issue', () => {
    const zero = expense({
      id: 'zero',
      twdAmount: 0,
      amount: 0,
      payerAllocations: { [OWNER]: 0, [GINA]: 0 },
      beneficiaries: [OWNER, GINA],
    });
    const batches = [batch({ expenseIds: ['zero'], memberIds: [GINA], memberIdsKind: 'targets' })];
    const debts = calculateOutstandingDebts([zero], members, batches);
    expect(Object.values(debts).every(Number.isFinite)).toBe(true);
    expect(debts[GINA]).toBe(0);
    expect(collectSettlementAccountingIssues([zero], members, batches)).toEqual([]);
  });

  it('a nonzero discharge with nothing paid fails closed: no NaN, no guess, issue reported', () => {
    const noPayer = expense({
      id: 'nopayer',
      twdAmount: 100,
      amount: 100,
      payerAllocations: { [OWNER]: 0, [GINA]: 0 },
      beneficiaries: [OWNER, GINA],
    });
    const batches = [batch({ expenseIds: ['nopayer'], memberIds: [GINA], memberIdsKind: 'targets' })];

    const debts = calculateOutstandingDebts([noPayer], members, batches);
    expect(Object.values(debts).every(Number.isFinite)).toBe(true);
    expect(Object.values(debts).some(Number.isNaN)).toBe(false);
    // Fail-closed: settlement is NOT applied, the debt stays visible.
    expect(debts[GINA]).toBe(-50);

    const issues = collectSettlementAccountingIssues([noPayer], members, batches);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('INVALID_ACCOUNTING_STATE');
    expect(issues[0].expenseId).toBe('nopayer');
  });

  it('a discharge with no remaining payer also fails closed rather than vanishing', () => {
    // Only the settled member paid; there is no other payer to receive the net.
    const soloPayer = expense({
      id: 'solopayer',
      twdAmount: 100,
      amount: 100,
      payerId: GINA,
      payerAllocations: { [GINA]: 100 },
      beneficiaries: [OWNER, GINA],
    });
    const batches = [batch({ expenseIds: ['solopayer'], memberIds: [GINA], memberIdsKind: 'targets' })];

    const debts = calculateOutstandingDebts([soloPayer], members, batches);
    expect(Object.values(debts).every(Number.isFinite)).toBe(true);
    expect(debts[GINA]).toBe(50);
    expect(debts[OWNER]).toBe(-50);
    expect(collectSettlementAccountingIssues([soloPayer], members, batches)).toHaveLength(1);
  });
});
