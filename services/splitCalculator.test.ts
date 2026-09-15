import { describe, it, expect } from 'vitest';
import { Expense, TripMember, Category, PaymentMethod, SplitMethod } from '../types';
import {
  calculateTripDebts,
  normalizePercentAllocations,
  normalizePayerAllocations,
  detectAllocationIssue,
  collectAllocationIssues,
  getEffectiveAllocations,
  getSplitBase,
  isSplitRelevant,
  SPLIT_TOLERANCE,
} from './splitCalculator';

const OWNER = 'owner-1';
const GHOST = 'ghost-1';

const members: TripMember[] = [
  { id: OWNER, name: '我', type: 'owner' },
  { id: GHOST, name: 'Ghost', type: 'guest' },
];

let seq = 0;
const expense = (overrides: Partial<Expense> = {}): Expense => {
  seq += 1;
  return {
    id: `e${seq}`,
    description: 'Test expense',
    amount: 1000,
    currency: 'TWD',
    exchangeRate: 1,
    twdAmount: 1000,
    category: Category.FOOD,
    paymentMethod: PaymentMethod.CASH_TWD,
    phase: 'during',
    date: '2026-09-10',
    payerId: OWNER,
    beneficiaries: [OWNER, GHOST],
    splitMethod: 'EQUAL' as SplitMethod,
    splitAllocations: {},
    ...overrides,
  };
};

const sum = (record: Record<string, number>) =>
  Object.keys(record).reduce((total, id) => total + record[id], 0);

describe('A. PERCENT unit handling', () => {
  it('A1: a 60/40 PERCENT split stored as TWD yields 600/400, not 6000/4000', () => {
    const e = expense({
      splitMethod: 'PERCENT',
      splitAllocations: { [OWNER]: 600, [GHOST]: 400 },
      payerId: OWNER,
    });
    const debts = calculateTripDebts([e], members);
    // Owner paid 1000 and is responsible for 600 -> +400. Ghost owes 400.
    expect(debts[OWNER]).toBe(400);
    expect(debts[GHOST]).toBe(-400);
  });

  it('A2: a fully allocated PERCENT expense nets to zero across all members', () => {
    const e = expense({
      splitMethod: 'PERCENT',
      splitAllocations: { [OWNER]: 600, [GHOST]: 400 },
    });
    expect(sum(calculateTripDebts([e], members))).toBe(0);
  });

  it('A3: EXACT and PERCENT with identical stored numbers give identical balances', () => {
    const allocations = { [OWNER]: 600, [GHOST]: 400 };
    const exact = calculateTripDebts([expense({ splitMethod: 'EXACT', splitAllocations: allocations })], members);
    const percent = calculateTripDebts([expense({ splitMethod: 'PERCENT', splitAllocations: allocations })], members);
    expect(percent).toEqual(exact);
  });
});

describe('B. Read-time normalizer', () => {
  it('B1: rule 1 no-op — TWD-stored allocations pass through unchanged', () => {
    const stored = { [OWNER]: 600, [GHOST]: 400 };
    expect(normalizePercentAllocations(stored, 1000)).toEqual(stored);
  });

  it('B2: rule 2 converts percent-shaped values against the base', () => {
    expect(normalizePercentAllocations({ [OWNER]: 60, [GHOST]: 40 }, 5000)).toEqual({
      [OWNER]: 3000,
      [GHOST]: 2000,
    });
  });

  it('B3: rule 3 leaves unreconcilable values untouched and flags them', () => {
    const stored = { [OWNER]: 300, [GHOST]: 200 };
    expect(normalizePercentAllocations(stored, 1000)).toEqual(stored);

    const issue = detectAllocationIssue(
      expense({ splitMethod: 'PERCENT', splitAllocations: stored })
    );
    expect(issue).not.toBeNull();
    expect(issue?.kind).toBe('UNRECONCILABLE');
    expect(issue?.allocatedTotal).toBe(500);
    expect(issue?.expectedTotal).toBe(1000);
  });

  it('B4: ambiguity — base 100 and sum 100 resolves to rule 1, no transform', () => {
    const stored = { [OWNER]: 60, [GHOST]: 40 };
    expect(normalizePercentAllocations(stored, 100)).toEqual(stored);
  });

  it('B5: deterministic — the same input twice produces a deep-equal result', () => {
    const stored = { [OWNER]: 60, [GHOST]: 40 };
    expect(normalizePercentAllocations(stored, 5000)).toEqual(
      normalizePercentAllocations(stored, 5000)
    );
  });

  it('B6: an empty allocation set normalizes to empty', () => {
    expect(normalizePercentAllocations({}, 1000)).toEqual({});
  });

  it('B6a: an EXACT/PERCENT expense with a nonzero base and no allocations is flagged EMPTY', () => {
    // Codex QA finding: this credits the payer in full and debits nobody, so the
    // imbalance must not pass silently.
    const e = expense({ splitMethod: 'PERCENT', splitAllocations: {}, payerId: OWNER });
    expect(calculateTripDebts([e], members)[OWNER]).toBe(1000);

    const issue = detectAllocationIssue(e);
    expect(issue?.kind).toBe('EMPTY');
    expect(issue?.allocatedTotal).toBe(0);
    expect(issue?.expectedTotal).toBe(1000);
  });

  it('B6b: EXACT with a nonzero base and no allocations is flagged EMPTY too', () => {
    expect(detectAllocationIssue(expense({ splitMethod: 'EXACT', splitAllocations: {} }))?.kind).toBe('EMPTY');
  });

  it('B6c: a zero-base expense with no allocations is consistent, not flagged', () => {
    expect(
      detectAllocationIssue(expense({ splitMethod: 'PERCENT', splitAllocations: {}, twdAmount: 0 }))
    ).toBeNull();
  });

  it('B7: the normalizer does not mutate the stored object', () => {
    const stored = { [OWNER]: 60, [GHOST]: 40 };
    normalizePercentAllocations(stored, 5000);
    expect(stored).toEqual({ [OWNER]: 60, [GHOST]: 40 });
  });
});

describe('C. HELP_BUY and EXCHANGE exclusion', () => {
  it('C1: a HELP_BUY expense contributes nothing to balances', () => {
    const e = expense({ category: Category.HELP_BUY, payerId: OWNER });
    expect(calculateTripDebts([e], members)).toEqual({ [OWNER]: 0, [GHOST]: 0 });
    expect(isSplitRelevant(e)).toBe(false);
  });

  it('C2: an EXCHANGE expense is still excluded', () => {
    const e = expense({ category: Category.EXCHANGE });
    expect(calculateTripDebts([e], members)).toEqual({ [OWNER]: 0, [GHOST]: 0 });
  });

  it('C3: a mixed ledger equals the same ledger with HELP_BUY rows removed', () => {
    const shared = expense({ payerId: OWNER });
    const helpBuy = expense({ category: Category.HELP_BUY, payerId: OWNER });
    expect(calculateTripDebts([shared, helpBuy], members)).toEqual(
      calculateTripDebts([shared], members)
    );
  });
});

describe('D. Accounting baseline and accumulation', () => {
  it('D1: the base is Math.round(twdAmount)', () => {
    expect(getSplitBase(expense({ twdAmount: 1000.4 }))).toBe(1000);
    expect(getSplitBase(expense({ twdAmount: 1000.6 }))).toBe(1001);
  });

  it('D2: a payer who is the sole beneficiary nets exactly zero', () => {
    const e = expense({ payerId: OWNER, beneficiaries: [OWNER], twdAmount: 1000.4 });
    const debts = calculateTripDebts([e], members);
    expect(debts[OWNER]).toBe(0);
  });

  it('D3: an aliased beneficiary list accumulates both shares instead of overwriting', () => {
    // 'me' and the owner id resolve to the same member. With assignment the
    // first share was silently dropped and the owner was under-charged.
    const e = expense({ beneficiaries: ['me', OWNER], payerId: OWNER });
    const debts = calculateTripDebts([e], members);
    expect(debts[OWNER]).toBe(0);
    expect(sum(debts)).toBe(0);
  });

  it('D4: multi-payer payerAllocations splits the credit', () => {
    const e = expense({
      payerId: OWNER,
      payerAllocations: { [OWNER]: 700, [GHOST]: 300 },
      beneficiaries: [OWNER, GHOST],
    });
    const debts = calculateTripDebts([e], members);
    // Each owes 500. Owner paid 700 -> +200; Ghost paid 300 -> -200.
    expect(debts[OWNER]).toBe(200);
    expect(debts[GHOST]).toBe(-200);
  });

  it('D5: a legacy expense without payerAllocations falls back to the payer at base', () => {
    const e = expense({ payerId: GHOST, payerAllocations: undefined, beneficiaries: [OWNER, GHOST] });
    const debts = calculateTripDebts([e], members);
    expect(debts[GHOST]).toBe(500);
    expect(debts[OWNER]).toBe(-500);
  });

  it("D6: a 'me' payer id is credited to the owner member", () => {
    const e = expense({ payerId: 'me', payerAllocations: undefined, beneficiaries: [OWNER, GHOST] });
    const debts = calculateTripDebts([e], members);
    expect(debts[OWNER]).toBe(500);
    expect(debts[GHOST]).toBe(-500);
  });
});

describe('F. Payer allocation normalization (Codex finding 2)', () => {
  it('F1: fractional multi-payer allocations conserve the rounded base exactly', () => {
    const e = expense({
      twdAmount: 1000.4,
      payerAllocations: { [OWNER]: 700, [GHOST]: 300.4 },
      beneficiaries: [OWNER, GHOST],
    });
    const debts = calculateTripDebts([e], members);
    expect(sum(debts)).toBe(0);
  });

  it('F2: the residual does not accumulate across repeated expenses', () => {
    const one = () =>
      expense({
        twdAmount: 1000.4,
        payerAllocations: { [OWNER]: 700, [GHOST]: 300.4 },
        beneficiaries: [OWNER, GHOST],
      });
    expect(sum(calculateTripDebts([one(), one(), one()], members))).toBe(0);
  });

  it('F3: integer allocations already summing to the base are untouched', () => {
    const paid = { [OWNER]: 700, [GHOST]: 300 };
    expect(normalizePayerAllocations(paid, 1000)).toEqual(paid);
  });

  it('F4: reconciliation is deterministic — largest fraction first, ties by id', () => {
    const paid = { b: 500.5, a: 499.5 };
    const normalized = normalizePayerAllocations(paid, 1000);
    expect(sum(normalized)).toBe(1000);
    expect(normalized).toEqual(normalizePayerAllocations(paid, 1000));
  });

  it('F5: payer data materially off the base is left untouched, not force-fitted', () => {
    const paid = { [OWNER]: 500 };
    expect(normalizePayerAllocations(paid, 1000)).toEqual(paid);
  });

  it('F6: the normalizer does not mutate the stored allocations', () => {
    const paid = { [OWNER]: 700, [GHOST]: 300.4 };
    normalizePayerAllocations(paid, 1000);
    expect(paid).toEqual({ [OWNER]: 700, [GHOST]: 300.4 });
  });
});

describe('G. EQUAL empty beneficiaries (Codex finding 3, extended)', () => {
  it('G1: a nonzero EQUAL expense with no beneficiaries is flagged EMPTY', () => {
    const e = expense({ beneficiaries: [], payerId: OWNER });
    expect(calculateTripDebts([e], members)[OWNER]).toBe(1000);
    const issue = detectAllocationIssue(e);
    expect(issue?.kind).toBe('EMPTY');
    expect(issue?.expectedTotal).toBe(1000);
  });

  it('G2: a zero-base EQUAL expense with no beneficiaries is not an issue', () => {
    expect(detectAllocationIssue(expense({ beneficiaries: [], twdAmount: 0 }))).toBeNull();
  });

  it('G3: a normal EQUAL expense is never flagged', () => {
    expect(detectAllocationIssue(expense())).toBeNull();
  });

  it('G4: no beneficiaries are fabricated to hide the imbalance', () => {
    const e = expense({ beneficiaries: [], payerId: OWNER });
    expect(calculateTripDebts([e], members)[GHOST]).toBe(0);
  });
});

describe('E. Guards', () => {
  it('E1: EQUAL with no beneficiaries does not crash and invents nobody', () => {
    const e = expense({ beneficiaries: [], payerId: OWNER });
    const debts = calculateTripDebts([e], members);
    // The payer is still credited; nothing is fabricated, so the imbalance stays visible.
    expect(debts[OWNER]).toBe(1000);
    expect(debts[GHOST]).toBe(0);
  });

  it('E2: an empty expense list leaves every member at zero', () => {
    expect(calculateTripDebts([], members)).toEqual({ [OWNER]: 0, [GHOST]: 0 });
  });

  it('E3: collectAllocationIssues reports only unreconcilable expenses', () => {
    const good = expense({ splitMethod: 'EXACT', splitAllocations: { [OWNER]: 600, [GHOST]: 400 } });
    const bad = expense({ splitMethod: 'EXACT', splitAllocations: { [OWNER]: 300, [GHOST]: 200 } });
    const issues = collectAllocationIssues([good, bad]);
    expect(issues).toHaveLength(1);
    expect(issues[0].expenseId).toBe(bad.id);
  });

  it('E4: a HELP_BUY expense is never reported as an allocation issue', () => {
    const e = expense({
      category: Category.HELP_BUY,
      splitMethod: 'EXACT',
      splitAllocations: { [OWNER]: 1 },
    });
    expect(detectAllocationIssue(e)).toBeNull();
  });

  it('E5: tolerance is applied at the documented boundary', () => {
    const stored = { [OWNER]: 1000 + SPLIT_TOLERANCE };
    expect(normalizePercentAllocations(stored, 1000)).toEqual(stored);
  });
});

describe('G. Canonical owner identity at the calculator boundary', () => {
  const CUR = 'trip-current:owner';
  const OLD = 'trip-old:owner';
  const GINA = 'companion-gina';
  const VEE = 'companion-v';
  const roster: TripMember[] = [
    { id: CUR, name: '我', type: 'owner' },
    { id: GINA, name: 'Gina', type: 'guest' },
    { id: VEE, name: 'V', type: 'guest' },
  ];

  it('G1 legacy 6500 fixture: three aliases collapse to two people, 3250 each', () => {
    const e = expense({
      twdAmount: 6500,
      payerId: 'me',
      payerAllocations: undefined,
      beneficiaries: ['me', OLD, GINA],
      splitMethod: 'EQUAL',
    });
    const debts = calculateTripDebts([e], roster.slice(0, 2));

    // owner paid 6500, owes 3250 of it
    expect(debts[CUR]).toBe(3250);
    expect(debts[GINA]).toBe(-3250);
    // No phantom third person under any alias.
    expect('me' in debts).toBe(false);
    expect(OLD in debts).toBe(false);
    expect(Object.keys(debts).sort()).toEqual([GINA, CUR].sort());
  });

  it('G2 three-person 4 + 5 fixture aggregates to +6 / -3 / -3', () => {
    const a = expense({ id: 'a', twdAmount: 4, payerId: CUR, payerAllocations: undefined, beneficiaries: [CUR, GINA, VEE] });
    const b = expense({ id: 'b', twdAmount: 5, payerId: 'me', payerAllocations: undefined, beneficiaries: ['me', GINA, VEE] });
    const debts = calculateTripDebts([a, b], roster);

    expect(debts[CUR]).toBeCloseTo(6, 10);
    expect(debts[GINA]).toBeCloseTo(-3, 10);
    expect(debts[VEE]).toBeCloseTo(-3, 10);
    expect(Object.keys(debts).sort()).toEqual([CUR, GINA, VEE].sort());
  });

  it('G3 EQUAL denominator uses the unique canonical count, not the raw length', () => {
    const e = expense({ twdAmount: 6500, payerId: CUR, payerAllocations: undefined, beneficiaries: ['me', OLD, CUR, GINA] });
    expect(e.beneficiaries.length).toBe(4);
    const debts = calculateTripDebts([e], roster.slice(0, 2));
    expect(debts[GINA]).toBe(-3250);
  });

  it('G4 payerId aliases are credited to the canonical owner', () => {
    const viaLegacy = calculateTripDebts(
      [expense({ twdAmount: 1000, payerId: 'me', payerAllocations: undefined, beneficiaries: [CUR, GINA] })],
      roster.slice(0, 2),
    );
    const viaOldTrip = calculateTripDebts(
      [expense({ twdAmount: 1000, payerId: OLD, payerAllocations: undefined, beneficiaries: [CUR, GINA] })],
      roster.slice(0, 2),
    );
    expect(viaLegacy[CUR]).toBe(500);
    expect(viaOldTrip[CUR]).toBe(500);
  });

  it('G5 payerAllocations aliases are collapsed, never summed', () => {
    const e = expense({
      twdAmount: 1000,
      payerId: CUR,
      payerAllocations: { me: 1000, [CUR]: 1000 },
      beneficiaries: [CUR, GINA],
    });
    const debts = calculateTripDebts([e], roster.slice(0, 2));
    // Credited 1000 once, not 2000; owes 500 of it.
    expect(debts[CUR]).toBe(500);
    expect(debts[GINA]).toBe(-500);
  });

  it('G6 EXACT allocations resolve owner aliases with no missing or duplicate share', () => {
    const e = expense({
      twdAmount: 500,
      payerId: CUR,
      payerAllocations: undefined,
      beneficiaries: [CUR, GINA],
      splitMethod: 'EXACT',
      splitAllocations: { me: 230, [GINA]: 270 },
    });
    expect(getEffectiveAllocations(e, CUR)).toEqual({ [CUR]: 230, [GINA]: 270 });
    const debts = calculateTripDebts([e], roster.slice(0, 2));
    expect(debts[CUR]).toBe(270);
    expect(debts[GINA]).toBe(-270);
  });

  it('G7 PERCENT allocations resolve owner aliases before shape conversion', () => {
    const e = expense({
      twdAmount: 1000,
      payerId: CUR,
      payerAllocations: undefined,
      beneficiaries: [CUR, GINA],
      splitMethod: 'PERCENT',
      splitAllocations: { me: 40, [GINA]: 60 },
    });
    expect(getEffectiveAllocations(e, CUR)).toEqual({ [CUR]: 400, [GINA]: 600 });
    const debts = calculateTripDebts([e], roster.slice(0, 2));
    expect(debts[CUR]).toBe(600);
    expect(debts[GINA]).toBe(-600);
  });

  it('G8 conflicting non-zero aliases are reported, not silently summed', () => {
    const e = expense({
      twdAmount: 500,
      payerId: CUR,
      beneficiaries: [CUR, GINA],
      splitMethod: 'EXACT',
      splitAllocations: { me: 200, [CUR]: 230, [GINA]: 270 },
    });
    const issue = detectAllocationIssue(e, CUR);
    expect(issue?.kind).toBe('IDENTITY_CONFLICT');
    expect(issue?.conflicts?.[0].memberId).toBe(CUR);
    expect(collectAllocationIssues([e], roster)).toHaveLength(1);
    // And the safe resolution never invents money: 200 + 230 is never 430.
    expect(getEffectiveAllocations(e, CUR)[CUR]).not.toBe(430);
  });

  it('G9 output ids are canonical only — never me, never a foreign owner id', () => {
    const e = expense({
      twdAmount: 900,
      payerId: 'me',
      payerAllocations: { [OLD]: 900 },
      beneficiaries: ['me', OLD, GINA, VEE],
    });
    const debts = calculateTripDebts([e], roster);
    Object.keys(debts).forEach(id => {
      expect(id).not.toBe('me');
      expect(id).not.toBe(OLD);
    });
    expect(debts[CUR]).toBe(600);
  });

  it('G10 without an owner member the calculator leaves ids untouched', () => {
    const e = expense({ twdAmount: 100, payerId: 'me', payerAllocations: undefined, beneficiaries: ['me'] });
    const debts = calculateTripDebts([e], [{ id: GINA, name: 'Gina', type: 'guest' }]);
    expect(debts['me']).toBe(0);
  });
});
