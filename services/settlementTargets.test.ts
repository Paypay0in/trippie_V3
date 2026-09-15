import { describe, it, expect } from 'vitest';
import { Category, Expense, PaymentMethod, TripMember } from '../types';
import {
  buildSettlementTargets,
  collectExpenseParticipantIds,
  reconcileSelectedTargets,
} from './settlementTargets';
import { calculateTripDebts } from './splitCalculator';

const OWNER = 'trip-1:owner';
const GINA = 'companion-gina';
const V = 'companion-v';

const members: TripMember[] = [
  { id: OWNER, name: '我', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
  { id: V, name: 'V', type: 'guest' },
];

const expense = (overrides: Partial<Expense>): Expense => ({
  id: 'e1',
  description: '來回機票',
  amount: 6500,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 6500,
  category: Category.TRANSPORT,
  paymentMethod: PaymentMethod.CASH_TWD,
  phase: 'pre',
  date: '2026-09-12',
  payerId: OWNER,
  beneficiaries: [OWNER, GINA],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  handlingFee: 0,
  needsReview: false,
  ...overrides,
});

const flight = expense({});
const withV = expense({ id: 'e2', description: '計程車', amount: 1000, twdAmount: 1000, beneficiaries: [OWNER, V] });

describe('settlement target derivation', () => {
  it('collects every accounting identity, owner-normalized', () => {
    const ids = collectExpenseParticipantIds(
      [expense({ payerId: 'me', payerAllocations: { me: 6500 }, splitAllocations: { 'trip-old:owner': 3250, [GINA]: 3250 } })],
      OWNER,
    );
    expect([...ids].sort()).toEqual([GINA, OWNER].sort());
  });

  it('ACCEPTANCE A: only Gina is a target for the 6500 flight; V is absent', () => {
    const targets = buildSettlementTargets([flight], members, OWNER);
    expect(targets.map(m => m.id)).toEqual([GINA]);
    expect(targets.some(m => m.id === V)).toBe(false);
  });

  it('never offers the owner as a target', () => {
    expect(buildSettlementTargets([flight], members, OWNER).some(m => m.id === OWNER)).toBe(false);
  });

  it('ACCEPTANCE B: multiple expenses union their members, de-duplicated', () => {
    expect(buildSettlementTargets([flight, withV], members, OWNER).map(m => m.id)).toEqual([GINA, V]);
  });

  it('ACCEPTANCE C: deselecting the V expense removes V from targets and selection', () => {
    const before = buildSettlementTargets([flight, withV], members, OWNER).map(m => m.id);
    const selected = reconcileSelectedTargets([], before);
    expect(selected).toEqual([GINA, V]);

    const after = buildSettlementTargets([flight], members, OWNER).map(m => m.id);
    expect(reconcileSelectedTargets(selected, after)).toEqual([GINA]);
  });

  it('keeps an existing selection and defaults newly available targets to selected', () => {
    expect(reconcileSelectedTargets([GINA], [GINA, V])).toEqual([GINA, V]);
    expect(reconcileSelectedTargets([GINA, V], [GINA])).toEqual([GINA]);
    expect(reconcileSelectedTargets(['ghost'], [GINA])).toEqual([GINA]);
  });

  it('GINA 3250: the preview uses selected expenses x selected targets only', () => {
    const targets = buildSettlementTargets([flight], members, OWNER);
    const settlementMembers = [members[0], ...targets];
    const debts = calculateTripDebts([flight], settlementMembers);

    expect(debts[GINA]).toBe(-3250);
    expect(debts[OWNER]).toBe(3250);
    expect(V in debts).toBe(false);
  });
});

describe('next-step validation and re-settlement eligibility', () => {
  // Mirrors the component's `canProceed`.
  const canProceed = (title: string, expenseIds: string[], targetIds: string[]) =>
    title.trim().length > 0 && expenseIds.length > 0 && targetIds.length > 0;

  it('requires a title, an expense, and a counterparty', () => {
    expect(canProceed('Day 1', ['e1'], [GINA])).toBe(true);
    expect(canProceed('   ', ['e1'], [GINA])).toBe(false);
    expect(canProceed('Day 1', [], [GINA])).toBe(false);
    expect(canProceed('Day 1', ['e1'], [])).toBe(false);
  });

  it('an owner-only expense offers no targets, so Next stays disabled', () => {
    const ownerOnly = expense({ id: 'solo', beneficiaries: [OWNER], payerId: OWNER });
    const targets = buildSettlementTargets([ownerOnly], members, OWNER);
    expect(targets).toEqual([]);
    expect(canProceed('Day 1', ['solo'], targets.map(t => t.id))).toBe(false);
  });

  it('an expense already settled with one member is still selectable for another', () => {
    // Hotel shared by owner + Gina + V: settle Gina now, V later.
    const hotel = expense({ id: 'hotel', twdAmount: 9000, amount: 9000, beneficiaries: [OWNER, GINA, V] });
    const targets = buildSettlementTargets([hotel], members, OWNER).map(t => t.id);
    expect(targets).toEqual([GINA, V]);

    // Round 1 settles Gina only; the expense must remain a valid target source.
    const roundOne = reconcileSelectedTargets([], targets).filter(id => id === GINA);
    expect(roundOne).toEqual([GINA]);
    const roundTwo = buildSettlementTargets([hotel], members, OWNER).map(t => t.id);
    expect(roundTwo).toContain(V);
  });
});
