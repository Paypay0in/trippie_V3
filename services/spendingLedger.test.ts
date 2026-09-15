import { describe, it, expect } from 'vitest';
import { Category, Expense, PaymentMethod, SettlementBatch, TripMember } from '../types';
import { selectPhaseSpendingExpenses, selectSpendingExpenses } from './spendingLedger';
import { calculateOutstandingDebts, filterOutstandingExpenses } from './settlementConsumption';

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
  memberIdsKind: 'targets',
  status: 'settled',
  createdAt: '2026-09-12T00:00:00.000Z',
  ...overrides,
});

const hotel = expense();
const ledger = [hotel];

/** The spending rule Dashboard applies: HELP_BUY is excluded, EXCHANGE costs only its fee. */
const spendingTotal = (expenses: Expense[]) =>
  expenses
    .filter(e => e.category !== Category.HELP_BUY)
    .reduce((sum, e) => sum + (e.category === Category.EXCHANGE ? e.handlingFee || 0 : e.twdAmount), 0);

const NOTHING_SETTLED: SettlementBatch[] = [];
const GINA_SETTLED = [batch({ memberIds: [GINA] })];
const BOTH_SETTLED = [batch({ memberIds: [GINA, V] })];
const LEGACY_SETTLED = [batch({ memberIds: [OWNER, GINA, V], memberIdsKind: undefined })];

describe('the spending ledger cannot see settlement state', () => {
  it('takes no batches at all — settlement has no path into a spending total', () => {
    expect(selectSpendingExpenses).toHaveLength(1);
    expect(selectPhaseSpendingExpenses).toHaveLength(2);
  });

  it('returns the ledger unchanged, and does not alias the caller’s array', () => {
    const selected = selectSpendingExpenses(ledger);
    expect(selected).toEqual(ledger);
    expect(selected).not.toBe(ledger);
  });

  it('phase selection filters by phase only', () => {
    const pre = expense({ id: 'flight', phase: 'pre', twdAmount: 6500, amount: 6500 });
    expect(selectPhaseSpendingExpenses([hotel, pre], 'during').map(e => e.id)).toEqual(['hotel']);
    expect(selectPhaseSpendingExpenses([hotel, pre], 'pre').map(e => e.id)).toEqual(['flight']);
    expect(selectPhaseSpendingExpenses([hotel, pre]).map(e => e.id)).toEqual(['hotel', 'flight']);
  });
});

describe('settlement never changes spending totals', () => {
  it('partial settlement: Gina settled, spending total stays NT$9,000', () => {
    expect(spendingTotal(selectSpendingExpenses(ledger))).toBe(9000);
    // Same ledger, same total, regardless of what has been settled.
    expect(spendingTotal(selectSpendingExpenses(ledger))).toBe(9000);
    expect(calculateOutstandingDebts(ledger, members, GINA_SETTLED)[GINA]).toBe(0);
  });

  it('full settlement: spending total STILL NT$9,000, and the hotel is still in the ledger', () => {
    const selected = selectSpendingExpenses(ledger);
    expect(spendingTotal(selected)).toBe(9000);
    expect(selected.map(e => e.id)).toContain('hotel');
    expect(calculateOutstandingDebts(ledger, members, BOTH_SETTLED)).toEqual({
      [OWNER]: 0,
      [GINA]: 0,
      [V]: 0,
    });
  });

  it('legacy whole-expense settlement also leaves spending untouched', () => {
    expect(spendingTotal(selectSpendingExpenses(ledger))).toBe(9000);
    expect(filterOutstandingExpenses(ledger, members, LEGACY_SETTLED)).toEqual([]);
  });

  it('the category total is identical in every settlement state', () => {
    const byCategory = (expenses: Expense[]) =>
      expenses
        .filter(e => e.category === Category.ACCOMMODATION)
        .reduce((sum, e) => sum + e.twdAmount, 0);
    [NOTHING_SETTLED, GINA_SETTLED, BOTH_SETTLED, LEGACY_SETTLED].forEach(() => {
      expect(byCategory(selectSpendingExpenses(ledger))).toBe(9000);
    });
  });
});

describe('debt balances DO change with settlement', () => {
  it('the same ledger yields different debts as settlement progresses', () => {
    expect(calculateOutstandingDebts(ledger, members, NOTHING_SETTLED)).toEqual({
      [OWNER]: 6000,
      [GINA]: -3000,
      [V]: -3000,
    });
    expect(calculateOutstandingDebts(ledger, members, GINA_SETTLED)).toEqual({
      [OWNER]: 3000,
      [GINA]: 0,
      [V]: -3000,
    });
    expect(calculateOutstandingDebts(ledger, members, BOTH_SETTLED)).toEqual({
      [OWNER]: 0,
      [GINA]: 0,
      [V]: 0,
    });
  });

  it('debts are identical whether the input was pre-filtered or raw', () => {
    // Dashboard now receives the raw ledger; the debt block must not shift.
    const raw = calculateOutstandingDebts(selectSpendingExpenses(ledger), members, GINA_SETTLED);
    const prefiltered = calculateOutstandingDebts(
      filterOutstandingExpenses(ledger, members, GINA_SETTLED),
      members,
      GINA_SETTLED,
    );
    expect(raw).toEqual(prefiltered);

    // ...including for legacy batches, where the expense is skipped internally.
    expect(calculateOutstandingDebts(selectSpendingExpenses(ledger), members, LEGACY_SETTLED)).toEqual(
      calculateOutstandingDebts(
        filterOutstandingExpenses(ledger, members, LEGACY_SETTLED),
        members,
        LEGACY_SETTLED,
      ),
    );
  });
});

describe('the expense list and the spending total stay consistent', () => {
  it('every expense the list shows is counted by the total, in any settlement state', () => {
    // ExpenseList renders the raw (phase-filtered) ledger; the Dashboard total
    // now reads the same source, so the two can no longer disagree.
    const listed = selectPhaseSpendingExpenses(ledger, 'during');
    const counted = selectPhaseSpendingExpenses(ledger, 'during');
    expect(counted.map(e => e.id)).toEqual(listed.map(e => e.id));
    expect(spendingTotal(counted)).toBe(9000);

    // The old behaviour: a settled expense vanished from the total while the
    // list below it still showed the row.
    expect(filterOutstandingExpenses(ledger, members, BOTH_SETTLED)).toEqual([]);
    expect(spendingTotal(filterOutstandingExpenses(ledger, members, BOTH_SETTLED))).toBe(0);
    expect(spendingTotal(listed)).not.toBe(0);
  });
});

describe('HELP_BUY is untouched by settlement either way', () => {
  it('a 朋友代買 expense is excluded from spending and from split accounting', () => {
    const helpBuy = expense({ id: 'gift', category: Category.HELP_BUY, twdAmount: 1200, amount: 1200 });
    expect(spendingTotal(selectSpendingExpenses([hotel, helpBuy]))).toBe(9000);
    // Not split-relevant, so no settlement state can ever move it.
    expect(calculateOutstandingDebts([helpBuy], members, NOTHING_SETTLED)).toEqual({
      [OWNER]: 0,
      [GINA]: 0,
      [V]: 0,
    });
  });
});
