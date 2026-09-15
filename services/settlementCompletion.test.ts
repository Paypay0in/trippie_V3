import { describe, it, expect } from 'vitest';
import { Category, Expense, PaymentMethod, SettlementBatch, TripMember } from '../types';
import { buildCompletedSettlementBatch, createOnceGuard } from './settlementTargets';
import { calculateOutstandingDebts, projectBatchSettlement } from './settlementConsumption';

/**
 * Founder UX decision, 2026-09-13: a new settlement completes in ONE tap.
 * 完成結算 creates the batch already settled, with the batch-scoped result
 * frozen — no intermediate open batch, no second visit.
 *
 * Existing open batches keep their own manual completion path.
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

const NOW = '2026-09-13T07:15:00.000Z';

/** Exactly what the 完成結算 handler builds for the Founder fixture. */
const completeGinaOnly = (id = 'settlement-1') =>
  buildCompletedSettlementBatch({
    id,
    tripId: 'trip-1',
    title: 'Day 1',
    expenseIds: ['hotel'],
    targetIds: [GINA],
    startDate: '2026-09-13',
    endDate: '2026-09-13',
    balances: projectBatchSettlement([hotel], members, [GINA], OWNER),
    total: 9000,
    now: NOW,
  });

describe('1-2. one action creates an already-settled batch', () => {
  const created = completeGinaOnly();

  it('the batch is born settled, with no intermediate open state', () => {
    expect(created.status).toBe('settled');
    expect(created.settledAt).toBe(NOW);
    expect(created.createdAt).toBe(NOW);
  });

  it('no open batch remains behind it', () => {
    const batches = [created];
    expect(batches.filter(b => b.status === 'open')).toEqual([]);
  });

  it('an empty title falls back rather than persisting blank', () => {
    const untitled = buildCompletedSettlementBatch({
      ...{ id: 'x', tripId: 'trip-1', expenseIds: ['hotel'], targetIds: [GINA], balances: {}, total: 0, now: NOW },
      title: '   ',
    });
    expect(untitled.title).toBe('未命名結算');
  });
});

describe('3. Gina-only settlement leaves Jin outstanding', () => {
  it('Gina clears, Jin still owes 3000, owner still owed 3000', () => {
    const debts = calculateOutstandingDebts([hotel], members, [completeGinaOnly()]);
    expect(debts[GINA]).toBe(0);
    expect(debts[JIN]).toBe(-3000);
    expect(debts[OWNER]).toBe(3000);
  });
});

describe('4-5. what is persisted', () => {
  const created = completeGinaOnly();

  it('frozenResult carries the batch-scoped projection, not the global figure', () => {
    expect(created.frozenResult).toBeDefined();
    expect(created.frozenResult?.balances[OWNER]).toBe(3000);
    expect(created.frozenResult?.balances[GINA]).toBe(-3000);
    expect(JIN in (created.frozenResult?.balances || {})).toBe(false);
    expect(created.frozenResult?.total).toBe(9000);
    expect(created.frozenResult?.computedAt).toBe(NOW);
  });

  it('memberIds are the targets only, marked as targets', () => {
    expect(created.memberIds).toEqual([GINA]);
    expect(created.memberIdsKind).toBe('targets');
    expect(created.expenseIds).toEqual(['hotel']);
  });

  it('input arrays are copied, never aliased into the persisted batch', () => {
    const expenseIds = ['hotel'];
    const targetIds = [GINA];
    const batch = buildCompletedSettlementBatch({
      id: 'copy', tripId: 'trip-1', title: 'T', expenseIds, targetIds,
      balances: { [OWNER]: 1 }, total: 1, now: NOW,
    });
    expenseIds.push('mutated');
    targetIds.push(JIN);
    expect(batch.expenseIds).toEqual(['hotel']);
    expect(batch.memberIds).toEqual([GINA]);
  });
});

describe('6. double submit creates exactly one batch', () => {
  it('a second tap is rejected by the guard, synchronously', () => {
    const saved: SettlementBatch[] = [];
    const guard = createOnceGuard();
    const tap = () => guard(() => saved.push(completeGinaOnly(`settlement-${saved.length}`)));

    expect(tap()).toBe(true);
    expect(tap()).toBe(false);
    expect(tap()).toBe(false);
    expect(saved).toHaveLength(1);
  });

  it('a fresh draft gets a fresh guard, so the next settlement still works', () => {
    const saved: SettlementBatch[] = [];
    let guard = createOnceGuard();
    guard(() => saved.push(completeGinaOnly('a')));
    guard(() => saved.push(completeGinaOnly('a-dupe')));
    // startNewSettlement() replaces the guard.
    guard = createOnceGuard();
    guard(() => saved.push(completeGinaOnly('b')));
    expect(saved.map(b => b.id)).toEqual(['a', 'b']);
  });

  it('two batches settling the same pair do not double-settle it', () => {
    const twice = [completeGinaOnly('one'), completeGinaOnly('two')];
    const debts = calculateOutstandingDebts([hotel], members, twice);
    expect(debts[GINA]).toBe(0);
    expect(debts[JIN]).toBe(-3000);
    expect(debts[OWNER]).toBe(3000);
  });
});

describe('7. the existing open-batch flow is untouched', () => {
  const openBatch: SettlementBatch = {
    id: 'legacy-open',
    tripId: 'trip-1',
    title: 'Day 0',
    expenseIds: ['hotel'],
    memberIds: [JIN],
    memberIdsKind: 'targets',
    status: 'open',
    createdAt: '2026-09-12T00:00:00.000Z',
  };

  it('an open batch settles nothing until it is completed', () => {
    const debts = calculateOutstandingDebts([hotel], members, [openBatch]);
    expect(debts[JIN]).toBe(-3000);
    expect(debts[GINA]).toBe(-3000);
  });

  it('completing it manually still works and settles only its own target', () => {
    const completed: SettlementBatch = { ...openBatch, status: 'settled', settledAt: NOW };
    const debts = calculateOutstandingDebts([hotel], members, [completed]);
    expect(debts[JIN]).toBe(0);
    expect(debts[GINA]).toBe(-3000);
  });
});

describe('8. reload preserves the completed settlement', () => {
  it('a JSON round-trip keeps status, marker, targets and frozen result', () => {
    const created = completeGinaOnly();
    const reloaded = JSON.parse(JSON.stringify([created])) as SettlementBatch[];

    expect(reloaded[0].status).toBe('settled');
    expect(reloaded[0].memberIdsKind).toBe('targets');
    expect(reloaded[0].memberIds).toEqual([GINA]);
    expect(reloaded[0].frozenResult?.balances[GINA]).toBe(-3000);

    expect(calculateOutstandingDebts([hotel], members, reloaded)).toEqual(
      calculateOutstandingDebts([hotel], members, [created]),
    );
    expect(calculateOutstandingDebts([hotel], members, reloaded)[JIN]).toBe(-3000);
  });
});
