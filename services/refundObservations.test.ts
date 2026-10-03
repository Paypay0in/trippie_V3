/**
 * 「如果按下去 可以輸入正確退稅金額 你之後就能反推退稅的規則？」
 *
 * Yes, but less than the question hopes, and these tests exist to hold that
 * line. A refund is not a flat percentage: the tax is a fixed share of the
 * pre-tax price and the operator then takes a handling fee from a banded table,
 * so the effective rate moves with the amount. One receipt is one point on a
 * step function, not the slope of a line.
 */
import { describe, expect, it } from 'vitest';
import {
  observedRate,
  rateForAmount,
  refundObservationsFrom,
  RefundObservation,
  ruleLooksWrong,
} from './refundObservations';
import { Category, Expense } from '../types';

const observation = (over: Partial<RefundObservation>): RefundObservation => ({
  currency: 'KRW', purchaseAmount: 100000, refundAmount: 6500, channel: 'airport', ...over,
});

const shopping = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'KRW', exchangeRate: 0.023,
  category: Category.SHOPPING, phase: 'during', date: '2026-10-02',
  payerId: 'me', beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

describe('一張收據告訴你的事', () => {
  it('在那個金額上的有效退稅率', () => {
    expect(observedRate(observation({ purchaseAmount: 100000, refundAmount: 6500 }))).toBeCloseTo(0.065);
  });

  it('打錯的數字不會變成一個比率', () => {
    // A refund bigger than a quarter of the purchase is a typo, not a rate.
    expect(observedRate(observation({ purchaseAmount: 100000, refundAmount: 100000 }))).toBeUndefined();
    expect(observedRate(observation({ purchaseAmount: 0, refundAmount: 500 }))).toBeUndefined();
    expect(observedRate(observation({ refundAmount: -1 }))).toBeUndefined();
  });
});

describe('從帳目收集起來的觀測值', () => {
  const normalize = (expense: Expense) => expense.amount;

  it('只收有填實際金額的', () => {
    const observations = refundObservationsFrom(
      [shopping({ id: 'a', amount: 100000, taxRefundActual: 6500 }), shopping({ id: 'b', amount: 50000 })],
      normalize, 'KRW', '釜山',
    );

    expect(observations).toHaveLength(1);
    expect(observations[0].purchaseAmount).toBe(100000);
  });

  it('記下是在哪一種通路退的——結帳時和機場是兩套級距', () => {
    const observations = refundObservationsFrom(
      [shopping({ amount: 60000, taxRefundActual: 3000, taxRefundedAtPurchase: true })],
      normalize, 'KRW',
    );

    expect(observations[0].channel).toBe('at_till');
  });

  it('不帶任何可以指認到人的東西——之後要彙整成我們自己的資料', () => {
    const serialised = JSON.stringify(refundObservationsFrom(
      [shopping({ id: 'e-private', description: '我的墨鏡', amount: 100000, taxRefundActual: 6500, payerId: 'seat-north' })],
      normalize, 'KRW', '釜山',
    ));

    expect(serialised).not.toContain('e-private');
    expect(serialised).not.toContain('seat-north');
    expect(serialised).not.toContain('我的墨鏡');
  });
});

describe('拿觀測值去估算', () => {
  it('金額相近的才採用', () => {
    const observations = [observation({ purchaseAmount: 100000, refundAmount: 6500 })];

    expect(rateForAmount(120000, observations, 0.06)?.rate).toBeCloseTo(0.065);
    expect(rateForAmount(120000, observations, 0.06)?.sampleSize).toBe(1);
  });

  it('差太多的金額就回去用查到的規則——借一個十倍大的購物的比率更糟', () => {
    const observations = [observation({ purchaseAmount: 1000000, refundAmount: 80000 })];
    const estimate = rateForAmount(50000, observations, 0.06);

    expect(estimate?.rate).toBe(0.06);
    expect(estimate?.sampleSize).toBe(0);
  });

  it('不同通路的觀測值不會互相汙染', () => {
    const observations = [observation({ purchaseAmount: 100000, refundAmount: 3000, channel: 'at_till' })];

    expect(rateForAmount(100000, observations, 0.06, 'airport')?.sampleSize).toBe(0);
    expect(rateForAmount(100000, observations, 0.06, 'at_till')?.sampleSize).toBe(1);
  });

  it('沒有觀測值也沒有規則時就說不知道', () => {
    expect(rateForAmount(100000, [], undefined)).toBeUndefined();
  });
});

describe('規則跟實際一直對不上時', () => {
  it('兩筆以上明顯偏離才說話', () => {
    const observations = [
      observation({ purchaseAmount: 100000, refundAmount: 8000 }),
      observation({ purchaseAmount: 120000, refundAmount: 9600 }),
    ];

    expect(ruleLooksWrong(observations, 0.06)).toBe(true);
  });

  it('只有一筆不算數——一張收據還不是趨勢', () => {
    expect(ruleLooksWrong([observation({ purchaseAmount: 100000, refundAmount: 8000 })], 0.06)).toBe(false);
  });

  it('差不多就不吵', () => {
    const observations = [
      observation({ purchaseAmount: 100000, refundAmount: 6200 }),
      observation({ purchaseAmount: 110000, refundAmount: 6800 }),
    ];

    expect(ruleLooksWrong(observations, 0.06)).toBe(false);
  });
});
