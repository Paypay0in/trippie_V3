import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod, TravelRules } from '../types';
import { deriveDuringRefundState } from './duringRefundState';

/**
 * 「要加一個按鈕：不可退稅」.
 *
 * The rule knows a threshold and a rate and nothing about what was bought or
 * where. A meal, a service, or a shop that is not tax-free registered all clear
 * the threshold and get counted in — so the headline promises money nobody can
 * collect, and somebody queues for it.
 */

const travelRules = {
  taxRefund: {
    numericCalculationAvailable: true,
    numericRuleSource: 'grounded',
    numericRule: {
      currency: 'KRW',
      minSpend: 15000,
      thresholdScope: 'per_transaction',
      refundMethod: { type: 'rate', rate: 0.06 },
    },
  },
} as unknown as TravelRules;

const purchase = (id: string, amount: number, over: Partial<Expense> = {}): Expense => ({
  id,
  description: id,
  amount,
  currency: 'KRW',
  exchangeRate: 0.023,
  handlingFee: 0,
  twdAmount: amount * 0.023,
  category: Category.SHOPPING,
  paymentMethod: PaymentMethod.CASH_FOREIGN,
  phase: 'during',
  date: '2026-10-03',
  payerId: 'me',
  payerAllocations: { me: amount },
  beneficiaries: ['me'],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  disputes: [],
  needsReview: false,
  receiptPhotos: [],
  ...over,
}) as Expense;

const derive = (expenses: Expense[]) => deriveDuringRefundState({ expenses, travelRules });

describe('a purchase marked 不可退稅', () => {
  it('leaves the estimate', () => {
    const withIt = derive([purchase('a', 30000), purchase('b', 20000)]);
    const without = derive([purchase('a', 30000), purchase('b', 20000, { taxRefundIneligible: true })]);

    expect(withIt.status).toBe('estimate_available');
    expect(without.status).toBe('estimate_available');
    if (withIt.status !== 'estimate_available' || without.status !== 'estimate_available') return;
    expect(Math.round(withIt.estimatedRefund)).toBe(3000);
    expect(Math.round(without.estimatedRefund)).toBe(1800);
  });

  it('leaves the eligible spend it was inflating', () => {
    const state = derive([purchase('a', 30000), purchase('b', 20000, { taxRefundIneligible: true })]);
    if (state.status !== 'estimate_available') throw new Error('expected an estimate');
    expect(state.eligibleSpend).toBe(30000);
    expect(state.eligibleItems.map(item => item.expense.id)).toEqual(['a']);
  });

  it('stays listed, so the mark can be taken back', () => {
    // A row that silently vanishes when it is tapped looks like a failure.
    const state = derive([purchase('a', 30000), purchase('b', 20000, { taxRefundIneligible: true })]);
    if (state.status !== 'estimate_available') throw new Error('expected an estimate');
    expect(state.ineligibleItems.map(item => item.expense.id)).toEqual(['b']);
  });

  it('never teaches the estimator a rate', () => {
    // Its 「refund」 is not a measurement of anything; treating a zero as an
    // observation would drag every other estimate down with it.
    const state = derive([
      purchase('a', 30000),
      purchase('b', 28000, { taxRefundIneligible: true, taxRefundActual: 0 }),
    ]);
    if (state.status !== 'estimate_available') throw new Error('expected an estimate');
    expect(state.observationCount).toBe(0);
    expect(Math.round(state.estimatedRefund)).toBe(1800);
  });

  it('wins over 結帳時已退稅 when both are set', () => {
    // 「不可退稅」 is the stronger statement: there was no refund to be given.
    const state = derive([
      purchase('a', 30000),
      purchase('b', 20000, { taxRefundIneligible: true, taxRefundedAtPurchase: true }),
    ]);
    if (state.status !== 'estimate_available') throw new Error('expected an estimate');
    expect(state.settledItems).toEqual([]);
    expect(state.ineligibleItems.map(item => item.expense.id)).toEqual(['b']);
  });

  it('drops out of the shopping total below the threshold too', () => {
    const state = derive([purchase('a', 9000), purchase('b', 8000, { taxRefundIneligible: true })]);
    if (state.status !== 'below_threshold') throw new Error('expected below threshold');
    expect(state.shoppingSpend).toBe(9000);
    expect(state.ineligibleItems.map(item => item.expense.id)).toEqual(['b']);
  });

  it('comes back when the mark is removed', () => {
    const state = derive([purchase('a', 30000), purchase('b', 20000)]);
    if (state.status !== 'estimate_available') throw new Error('expected an estimate');
    expect(state.ineligibleItems).toEqual([]);
    expect(state.eligibleItems).toHaveLength(2);
  });
});

/**
 * Both travellers have to agree on which purchases are worth carrying to the
 * counter, so the mark travels with the expense rather than sitting on one
 * phone.
 */
describe('不可退稅的標記', () => {
  it('跟著帳目一起同步', async () => {
    const { toExpenseRow, fromExpenseRow } = await import('./tripSyncMapping');

    const row = toExpenseRow(purchase('e1', 60000, { taxRefundIneligible: true }), 'trip-1');

    expect(row.tax_refund_ineligible).toBe(true);
    expect(fromExpenseRow(row as never).taxRefundIneligible).toBe(true);
  });

  it('沒標記的不會變成 true', async () => {
    const { fromExpenseRow } = await import('./tripSyncMapping');

    expect(fromExpenseRow({ tax_refund_ineligible: false } as never).taxRefundIneligible).toBeUndefined();
    // A row written before 0015 has no such column at all.
    expect(fromExpenseRow({} as never).taxRefundIneligible).toBeUndefined();
  });
});
