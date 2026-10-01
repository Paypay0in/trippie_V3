import { describe, expect, it } from 'vitest';
import { expenseConcernsMember, partitionByConcern } from './expenseConcernsMember';
import { Category, PaymentMethod } from '../types';
import type { Expense } from '../types';

const ANN = 'trip:owner';
const GINA = 'seat-gina';

const expense = (fields: Partial<Expense>): Expense => ({
  id: 'e-1',
  description: '',
  amount: 100,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 100,
  category: Category.OTHER,
  paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'pre',
  date: '2026-10-02',
  payerId: ANN,
  beneficiaries: [ANN],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...fields,
});

describe('whether an expense is this member\'s business', () => {
  it('is, when they paid it', () => {
    expect(expenseConcernsMember(expense({ payerId: ANN, beneficiaries: [ANN] }), ANN)).toBe(true);
  });

  it('is, when somebody else paid but it is being split with them', () => {
    expect(expenseConcernsMember(expense({ payerId: GINA, beneficiaries: [ANN, GINA] }), ANN)).toBe(true);
  });

  it('is not, when she bought it for herself', () => {
    expect(expenseConcernsMember(expense({ payerId: GINA, beneficiaries: [GINA] }), ANN)).toBe(false);
  });

  it('is, when they carry an explicit share of it', () => {
    const shared = expense({ payerId: GINA, beneficiaries: [GINA], splitAllocations: { [ANN]: 300 } });
    expect(expenseConcernsMember(shared, ANN)).toBe(true);
  });

  it('is, when they paid part of a bill somebody else is named on', () => {
    const shared = expense({ payerId: GINA, beneficiaries: [GINA], payerAllocations: { [GINA]: 600, [ANN]: 400 } });
    expect(expenseConcernsMember(shared, ANN)).toBe(true);
  });

  it('shows a record that names nobody, rather than hiding it', () => {
    const orphan = expense({ payerId: '', beneficiaries: [], splitAllocations: {} });
    expect(expenseConcernsMember(orphan, ANN)).toBe(true);
  });

  it('shows everything when there is no viewer to judge against', () => {
    expect(expenseConcernsMember(expense({ payerId: GINA, beneficiaries: [GINA] }), undefined)).toBe(true);
  });

  it('splits a ledger into what he has to settle and what is simply hers', () => {
    const ledger = [
      expense({ id: 'a', amount: 500, payerId: ANN, beneficiaries: [ANN] }),
      expense({ id: 'b', amount: 12000, payerId: ANN, beneficiaries: [ANN, GINA] }),
      expense({ id: 'c', amount: 888, payerId: GINA, beneficiaries: [GINA] }),
    ];

    const { mine, others } = partitionByConcern(ledger, ANN);

    expect(mine.map(item => item.id)).toEqual(['a', 'b']);
    expect(others.map(item => item.id)).toEqual(['c']);
  });
});
