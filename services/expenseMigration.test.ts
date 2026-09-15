import { describe, it, expect } from 'vitest';
import { Category, PaymentMethod, TripMember } from '../types';
import {
  migrateLegacyExpense,
  migrateLegacyExpenses,
  ownerMemberIdForTrip,
} from './expenseMigration';
import { calculateTripDebts, collectAllocationIssues } from './splitCalculator';

/**
 * migrateExpenses() used to mint the literal owner alias "me" for any legacy
 * expense with no payer. Every call site knows its trip/draft id, so the
 * canonical owner is derived; without one, the legacy default is preserved.
 */

const TRIP = 'trip-1';
const OWNER = 'trip-1:owner';
const GINA = 'companion-gina';

const members: TripMember[] = [
  { id: OWNER, name: '我', type: 'owner' },
  { id: GINA, name: 'Gina', type: 'guest' },
];

const legacyBase = {
  id: 'old-1',
  description: '舊資料',
  amount: 1000,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 1000,
  category: Category.FOOD,
  phase: 'during',
  date: '2026-01-01',
};

describe('owner id derivation', () => {
  it('derives the canonical owner from the trip id, and nothing from nothing', () => {
    expect(ownerMemberIdForTrip(TRIP)).toBe(OWNER);
    expect(ownerMemberIdForTrip(undefined)).toBeUndefined();
    expect(ownerMemberIdForTrip('')).toBeUndefined();
  });
});

describe('1. legacy expense missing payerId, canonical owner available', () => {
  it('defaults to the canonical owner instead of minting "me"', () => {
    const migrated = migrateLegacyExpense(legacyBase, OWNER);
    expect(migrated.payerId).toBe(OWNER);
    expect(migrated.beneficiaries).toEqual([OWNER]);
    expect(migrated.payerId).not.toBe('me');
  });

  it('still converts the legacy 現金 payment method and fills split defaults', () => {
    const migrated = migrateLegacyExpense(
      { ...legacyBase, paymentMethod: '現金', currency: 'JPY' },
      OWNER,
    );
    expect(migrated.paymentMethod).toBe(PaymentMethod.CASH_FOREIGN);
    expect(migrated.splitMethod).toBe('EQUAL');
    expect(migrated.splitAllocations).toEqual({});
    expect(migrated.needsReview).toBe(false);
  });
});

describe('2. legacy beneficiaries containing "me"', () => {
  it('normalizes the alias to the canonical owner', () => {
    const migrated = migrateLegacyExpense(
      { ...legacyBase, payerId: 'me', beneficiaries: ['me', GINA] },
      OWNER,
    );
    expect(migrated.payerId).toBe(OWNER);
    expect(migrated.beneficiaries).toEqual([OWNER, GINA]);
  });

  it('normalizes allocation record keys too', () => {
    const migrated = migrateLegacyExpense(
      {
        ...legacyBase,
        payerId: 'me',
        beneficiaries: ['me', GINA],
        payerAllocations: { me: 1000 },
        splitMethod: 'EXACT',
        splitAllocations: { me: 400, [GINA]: 600 },
      },
      OWNER,
    );
    expect(migrated.payerAllocations).toEqual({ [OWNER]: 1000 });
    expect(migrated.splitAllocations).toEqual({ [OWNER]: 400, [GINA]: 600 });
  });
});

describe('3. mixed owner id + "me" aliases do not duplicate responsibility', () => {
  it('the same human is counted once, and the EQUAL denominator is 2 not 3', () => {
    const migrated = migrateLegacyExpense(
      { ...legacyBase, twdAmount: 6000, payerId: 'me', beneficiaries: ['me', OWNER, GINA] },
      OWNER,
    );
    expect(migrated.beneficiaries).toEqual([OWNER, GINA]);

    const debts = calculateTripDebts([migrated], members);
    expect(debts[GINA]).toBe(-3000);
    expect(debts[OWNER]).toBe(3000);
  });
});

describe('4. migration is idempotent', () => {
  it('migrating twice changes nothing', () => {
    const once = migrateLegacyExpense({ ...legacyBase, payerId: 'me', beneficiaries: ['me'] }, OWNER);
    const twice = migrateLegacyExpense(once, OWNER);
    expect(twice).toEqual(once);
  });

  it('a reload round-trip is stable', () => {
    const once = migrateLegacyExpenses([{ ...legacyBase, paymentMethod: '現金' }], OWNER);
    const reloaded = migrateLegacyExpenses(JSON.parse(JSON.stringify(once)), OWNER);
    expect(reloaded).toEqual(once);
  });

  it('never mutates the input object', () => {
    const raw: any = { ...legacyBase, beneficiaries: ['me'] };
    migrateLegacyExpense(raw, OWNER);
    expect(raw.payerId).toBeUndefined();
    expect(raw.beneficiaries).toEqual(['me']);
  });
});

describe('5. ambiguity fails closed rather than guessing', () => {
  it('with no owner id, the legacy "me" default is preserved exactly as before', () => {
    const migrated = migrateLegacyExpense(legacyBase, undefined);
    expect(migrated.payerId).toBe('me');
    expect(migrated.beneficiaries).toEqual(['me']);
  });

  it('with no owner id, stored aliases are left untouched — no roster guessing', () => {
    const migrated = migrateLegacyExpense(
      {
        ...legacyBase,
        payerId: 'me',
        beneficiaries: ['me', GINA],
        splitMethod: 'EXACT',
        splitAllocations: { me: 500 },
      },
      undefined,
    );
    expect(migrated.payerId).toBe('me');
    expect(migrated.beneficiaries).toEqual(['me', GINA]);
    expect(migrated.splitAllocations).toEqual({ me: 500 });
  });

  it('PRE-EXISTING: a record with allocations but no splitMethod still loses them', () => {
    // Untouched by this ticket. The original migrateExpenses reset
    // splitAllocations whenever splitMethod was missing, and changing that
    // would alter historical accounting meaning. Documented, not fixed here.
    const migrated = migrateLegacyExpense(
      { ...legacyBase, payerId: OWNER, splitAllocations: { [GINA]: 500 } },
      OWNER,
    );
    expect(migrated.splitMethod).toBe('EQUAL');
    expect(migrated.splitAllocations).toEqual({});
  });

  it('conflicting owner aliases in a money record are preserved, not resolved', () => {
    const conflicting = {
      ...legacyBase,
      payerId: OWNER,
      beneficiaries: [OWNER, GINA],
      splitMethod: 'EXACT',
      splitAllocations: { me: 200, [OWNER]: 300, [GINA]: 500 },
    };
    const migrated = migrateLegacyExpense(conflicting, OWNER);
    // Left exactly as stored: two aliases disagree, so nothing is merged.
    expect(migrated.splitAllocations).toEqual({ me: 200, [OWNER]: 300, [GINA]: 500 });
    // And the calculator still reports it rather than silently absorbing it.
    expect(collectAllocationIssues([migrated], members)[0]?.kind).toBe('IDENTITY_CONFLICT');
  });
});

describe('6. already-canonical expenses are unaffected', () => {
  const canonical = {
    ...legacyBase,
    paymentMethod: PaymentMethod.CASH_TWD,
    payerId: OWNER,
    beneficiaries: [OWNER, GINA],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    needsReview: false,
  };

  it('migration returns an equivalent object', () => {
    expect(migrateLegacyExpense(canonical, OWNER)).toEqual(canonical);
  });

  it('accounting behaviour is byte-equivalent before and after migration', () => {
    expect(calculateTripDebts([migrateLegacyExpense(canonical, OWNER)], members)).toEqual(
      calculateTripDebts([canonical as any], members),
    );
  });

  it('an empty or non-array ledger migrates to an empty list', () => {
    expect(migrateLegacyExpenses([], OWNER)).toEqual([]);
    expect(migrateLegacyExpenses(undefined as any, OWNER)).toEqual([]);
  });
});
