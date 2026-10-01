import { describe, expect, it } from 'vitest';
import { paidByMember, totalPaidByMember } from './expensePaidBy';
import type { Expense } from '../types';

const expense = (fields: Partial<Expense>): Expense => ({
  id: 'e-1',
  description: '',
  amount: 100,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 100,
  category: '其他' as Expense['category'],
  paymentMethod: '信用卡' as Expense['paymentMethod'],
  phase: 'pre',
  date: '2026-10-02',
  payerId: 'seat-ann',
  beneficiaries: [],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...fields,
});

describe('what one member paid', () => {
  it('is the whole amount when they are the payer', () => {
    expect(paidByMember(expense({ amount: 12000, payerId: 'seat-ann' }), 'seat-ann')).toBe(12000);
  });

  it('is nothing when somebody else paid', () => {
    expect(paidByMember(expense({ amount: 888, payerId: 'seat-gina' }), 'seat-ann')).toBe(0);
  });

  it('follows the split when a bill had more than one payer', () => {
    const shared = expense({ amount: 1000, payerId: 'seat-ann', payerAllocations: { 'seat-ann': 600, 'seat-gina': 400 } });

    expect(paidByMember(shared, 'seat-ann')).toBe(600);
    expect(paidByMember(shared, 'seat-gina')).toBe(400);
  });

  it('attributes a record with no payer to nobody, rather than guessing', () => {
    expect(paidByMember(expense({ payerId: '' }), 'seat-ann')).toBe(0);
    expect(paidByMember(expense({}), undefined)).toBe(0);
  });

  it('adds up across the ledger', () => {
    const ledger = [
      expense({ id: 'a', amount: 500, payerId: 'seat-ann' }),
      expense({ id: 'b', amount: 12000, payerId: 'seat-ann' }),
      expense({ id: 'c', amount: 888, payerId: 'seat-gina' }),
    ];

    expect(totalPaidByMember(ledger, 'seat-ann')).toBe(12500);
    expect(totalPaidByMember(ledger, 'seat-gina')).toBe(888);
  });
});
