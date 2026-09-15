import { describe, it, expect } from 'vitest';
import { Category, Expense, PaymentMethod, SettlementBatch, TripMember } from '../types';
import { calculateOutstandingDebts, projectBatchSettlement } from './settlementConsumption';
import { calculateExpenseLedger } from './splitCalculator';

/**
 * Founder live-UI bug, 2026-09-13: a batch targeting Gina alone showed
 * 我應收 NT$6,000 with BOTH Gina and Jin listed. The confirmation screen was
 * rendering global outstanding debt instead of what this batch settles.
 *
 * The projection is display-only. Responsibility still comes from the untouched
 * expense ledger: no beneficiary is removed before the split is computed.
 */

const OWNER = 'trip-1:owner';
const GINA = 'companion-gina';
const JIN = 'companion-jin';

const members: TripMember[] = [
  { id: OWNER, name: '我', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
  { id: JIN, name: 'Jin', type: 'guest' },
];

const hotel: Expense = {
  id: 'hotel',
  description: '飯店',
  amount: 9000,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 9000,
  category: Category.ACCOMMODATION,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'during',
  date: '2026-09-13',
  payerId: OWNER,
  beneficiaries: [OWNER, GINA, JIN],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  handlingFee: 0,
  needsReview: false,
};

const receivable = (balances: Record<string, number>) =>
  Object.keys(balances)
    .filter(id => id !== OWNER && balances[id] < 0)
    .reduce((sum, id) => sum + Math.abs(balances[id]), 0);

describe('confirmation is scoped to the batch targets', () => {
  it('A: target Gina only -> owner +3000, Gina -3000, Jin absent', () => {
    const projected = projectBatchSettlement([hotel], members, [GINA], OWNER);
    expect(projected[OWNER]).toBe(3000);
    expect(projected[GINA]).toBe(-3000);
    expect(JIN in projected).toBe(false);
    expect(receivable(projected)).toBe(3000);
    // The reported symptom: 我應收 must not be the global 6000.
    expect(projected[OWNER]).not.toBe(6000);
  });

  it('B: target Jin only -> owner +3000, Jin -3000, Gina absent', () => {
    const projected = projectBatchSettlement([hotel], members, [JIN], OWNER);
    expect(projected[OWNER]).toBe(3000);
    expect(projected[JIN]).toBe(-3000);
    expect(GINA in projected).toBe(false);
    expect(receivable(projected)).toBe(3000);
  });

  it('C: target Gina + Jin -> owner +6000, each -3000', () => {
    const projected = projectBatchSettlement([hotel], members, [GINA, JIN], OWNER);
    expect(projected[OWNER]).toBe(6000);
    expect(projected[GINA]).toBe(-3000);
    expect(projected[JIN]).toBe(-3000);
    expect(receivable(projected)).toBe(6000);
  });

  it('the owner is never listed as a target of their own settlement', () => {
    const projected = projectBatchSettlement([hotel], members, [OWNER, GINA], OWNER);
    expect(projected[GINA]).toBe(-3000);
    expect(projected[OWNER]).toBe(3000);
  });

  it('owner aliases in the target list resolve and are then excluded', () => {
    expect(projectBatchSettlement([hotel], members, ['me'], OWNER)).toEqual({ [OWNER]: 0 });
  });

  it('no targets projects nothing', () => {
    expect(projectBatchSettlement([hotel], members, [], OWNER)).toEqual({ [OWNER]: 0 });
  });
});

describe('the projection never touches the split itself', () => {
  it('the EQUAL denominator stays 3 even when only one target is projected', () => {
    const { responsibility } = calculateExpenseLedger(hotel, OWNER);
    expect(responsibility[GINA]).toBe(3000);
    expect(responsibility[JIN]).toBe(3000);
    expect(responsibility[OWNER]).toBe(3000);

    // Projecting Gina alone must not reprice her share to 4500.
    expect(projectBatchSettlement([hotel], members, [GINA], OWNER)[GINA]).toBe(-3000);
  });

  it('a target who also paid is netted, not double counted', () => {
    const shared: Expense = {
      ...hotel,
      id: 'shared',
      twdAmount: 9000,
      payerAllocations: { [OWNER]: 6000, [GINA]: 3000 },
    };
    // Gina paid 3000 and owes 3000 for the same expense: nothing to settle.
    expect(projectBatchSettlement([shared], members, [GINA], OWNER)[GINA]).toBe(0);
    expect(projectBatchSettlement([shared], members, [JIN], OWNER)[JIN]).toBe(-3000);
  });

  it('multiple expenses accumulate for the projected targets only', () => {
    const taxi: Expense = { ...hotel, id: 'taxi', twdAmount: 300, amount: 300 };
    const projected = projectBatchSettlement([hotel, taxi], members, [GINA], OWNER);
    expect(projected[GINA]).toBe(-3100);
    expect(projected[OWNER]).toBe(3100);
    expect(JIN in projected).toBe(false);
  });
});

describe('global accounting is unaffected by the display fix', () => {
  const batches: SettlementBatch[] = [];

  it('global outstanding still shows both members owing 3000', () => {
    const global = calculateOutstandingDebts([hotel], members, batches);
    expect(global[OWNER]).toBe(6000);
    expect(global[GINA]).toBe(-3000);
    expect(global[JIN]).toBe(-3000);
  });

  it("settling Gina's batch leaves Jin globally outstanding", () => {
    const settledGina: SettlementBatch[] = [
      {
        id: 'b-gina',
        tripId: 'trip-1',
        title: 'Day 1',
        expenseIds: ['hotel'],
        memberIds: [GINA],
        memberIdsKind: 'targets',
        status: 'settled',
        createdAt: '2026-09-13T00:00:00.000Z',
      },
    ];
    const global = calculateOutstandingDebts([hotel], members, settledGina);
    expect(global[GINA]).toBe(0);
    expect(global[JIN]).toBe(-3000);
    expect(global[OWNER]).toBe(3000);

    // And the batch's own projection still reads 3000, not the global figure.
    expect(projectBatchSettlement([hotel], members, [GINA], OWNER)[OWNER]).toBe(3000);
  });
});
