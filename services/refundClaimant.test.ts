import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import { refundClaimableBy } from './refundClaimant';

/**
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」.
 *
 * Sharing the cost of a purchase and being able to claim its tax back are two
 * different facts. The second follows the receipt, and the receipt follows
 * whoever paid.
 */
const OWNER = 'owner';
const GINA = 'seat-gina';

const bill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'e-medicine',
    description: '藥品',
    amount: 75900,
    currency: 'KRW',
    exchangeRate: 0.023,
    twdAmount: 1745,
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

describe('退稅是誰的', () => {
  it('她付的錢，退稅是她的 —— 就算我有分到一半', () => {
    expect(refundClaimableBy(bill(), OWNER, OWNER)).toBe(false);
  });

  it('我付的錢，退稅是我的', () => {
    expect(refundClaimableBy(bill({ payerId: OWNER }), OWNER, OWNER)).toBe(true);
  });

  it('她付的錢，在她自己的畫面上是她的', () => {
    expect(refundClaimableBy(bill(), GINA, OWNER)).toBe(true);
  });

  it('沒有人分帳的時候，照樣是我的', () => {
    expect(refundClaimableBy(bill({ payerId: undefined, beneficiaries: [] }), OWNER, OWNER))
      .toBe(true);
  });

  it('兩個人各出一部分，有出錢的那邊才算', () => {
    const split = bill({
      payerId: undefined,
      payerAllocations: { [OWNER]: 30000, [GINA]: 45900 },
    });
    expect(refundClaimableBy(split, OWNER, OWNER)).toBe(true);
    expect(refundClaimableBy(split, GINA, OWNER)).toBe(true);
  });

  it('兩個人各出一部分，沒出錢的第三人不算', () => {
    const split = bill({
      payerId: undefined,
      payerAllocations: { [OWNER]: 30000, [GINA]: 45900 },
    });
    expect(refundClaimableBy(split, 'seat-ann', OWNER)).toBe(false);
  });

  it('沒有指定觀看者時不過濾任何東西', () => {
    expect(refundClaimableBy(bill(), undefined, OWNER)).toBe(true);
  });

  /**
   * The trip owner is addressed by two names — their seat id and the owner id —
   * and a refund must not change hands because of which one a record used.
   */
  it('旅程主人的兩個身分指的是同一個人', () => {
    expect(refundClaimableBy(bill({ payerId: OWNER }), 'me', OWNER)).toBe(true);
  });
});
