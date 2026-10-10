import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import { refundShareRatio } from './refundClaimant';

/**
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」, then
 * 「若某帳一起結帳 但同時可以退稅 請將退稅的總額按比例分配」.
 *
 * The refund divides exactly as the bill does — one ratio, rather than one
 * rule for a shared bill, another for a solo one and a third for something
 * merely fronted on somebody else's behalf.
 */
const OWNER = 'me';
const GINA = 'seat-gina';

const bill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'e-medicine',
    description: '藥品',
    amount: 75900,
    currency: 'KRW',
    exchangeRate: 0.023,
    twdAmount: 1746,
    category: Category.SHOPPING,
    paymentMethod: PaymentMethod.CASH_FOREIGN,
    phase: 'during',
    date: '2026-10-06',
    payerId: GINA,
    beneficiaries: [OWNER, GINA],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

describe('退稅按比例分', () => {
  it('她付的、兩人均分 —— 我拿一半', () => {
    expect(refundShareRatio(bill(), OWNER, OWNER)).toBeCloseTo(0.5, 5);
  });

  it('同一筆，她那邊也是一半 —— 不會被算兩次', () => {
    expect(refundShareRatio(bill(), GINA, OWNER)).toBeCloseTo(0.5, 5);
  });

  it('兩邊加起來剛好是一整筆', () => {
    const mine = refundShareRatio(bill(), OWNER, OWNER);
    const hers = refundShareRatio(bill(), GINA, OWNER);
    expect(mine + hers).toBeCloseTo(1, 5);
  });

  it('自己一個人買的，整筆都是我的', () => {
    const solo = bill({ payerId: OWNER, beneficiaries: [OWNER] });
    expect(refundShareRatio(solo, OWNER, OWNER)).toBeCloseTo(1, 5);
  });

  it('純代墊 —— 我出錢但分給她，我一毛也沒有', () => {
    const fronted = bill({ payerId: OWNER, beneficiaries: [GINA] });
    expect(refundShareRatio(fronted, OWNER, OWNER)).toBe(0);
  });

  it('完全跟我無關的帳是 0', () => {
    const hers = bill({ payerId: GINA, beneficiaries: [GINA] });
    expect(refundShareRatio(hers, OWNER, OWNER)).toBe(0);
  });

  it('不平均分的時候，照實際份額走', () => {
    const uneven = bill({
      splitMethod: 'EXACT',
      splitAllocations: { [OWNER]: 1309.5, [GINA]: 436.5 },
      beneficiaries: [OWNER, GINA],
    });
    expect(refundShareRatio(uneven, OWNER, OWNER)).toBeCloseTo(0.75, 2);
  });

  it('沒有指定觀看者時，不分割', () => {
    expect(refundShareRatio(bill(), undefined, OWNER)).toBe(1);
  });

  it('金額是 0 的帳不會算出比例', () => {
    expect(refundShareRatio(bill({ twdAmount: 0 }), OWNER, OWNER)).toBe(0);
  });

  it('金額壞掉的帳不會變成 NaN', () => {
    expect(refundShareRatio(bill({ twdAmount: NaN }), OWNER, OWNER)).toBe(0);
  });
});
