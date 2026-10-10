import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import { refundClaimableBy } from './refundClaimant';
import { sharedWithSomebody } from './refundSharedNote';
import { expenseCostToViewer } from './viewerSpend';

/**
 * 「退稅的行為人依然是付總額的人 ... 該退稅不是計入分帳者的退稅總額 是變成在結算時
 * 的減掉的金額」.
 *
 * Two separate facts. Who can go and claim it: whoever holds the receipt. Who
 * benefits from it: everyone who is paying for the purchase, proportionally,
 * and they get it as a smaller bill rather than as cash at a counter.
 */
const OWNER = 'me';
const GINA = 'seat-gina';

const bill = (over: Partial<Expense> = {}): Expense =>
  ({
    id: 'e-medicine',
    description: '藥品',
    amount: 75900,
    currency: 'KRW',
    exchangeRate: 1,
    twdAmount: 75900,
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

describe('誰去櫃檯領', () => {
  it('她付的錢，櫃檯那趟是她的 —— 就算我分了一半', () => {
    expect(refundClaimableBy(bill(), OWNER, OWNER)).toBe(false);
  });

  it('同一筆在她自己的畫面上是她的', () => {
    expect(refundClaimableBy(bill(), GINA, OWNER)).toBe(true);
  });

  it('我付的錢，那趟是我的', () => {
    expect(refundClaimableBy(bill({ payerId: OWNER }), OWNER, OWNER)).toBe(true);
  });

  it('兩個人各出一部分，各自有自己的收據', () => {
    const split = bill({ payerId: undefined, payerAllocations: { [OWNER]: 30000, [GINA]: 45900 } });
    expect(refundClaimableBy(split, OWNER, OWNER)).toBe(true);
    expect(refundClaimableBy(split, GINA, OWNER)).toBe(true);
    expect(refundClaimableBy(split, 'seat-ann', OWNER)).toBe(false);
  });

  it('沒寫誰付的，照樣算我的', () => {
    expect(refundClaimableBy(bill({ payerId: undefined, beneficiaries: [] }), OWNER, OWNER))
      .toBe(true);
  });

  it('旅程主人的兩個身分是同一個人', () => {
    expect(refundClaimableBy(bill({ payerId: OWNER }), 'me', OWNER)).toBe(true);
  });
});

/**
 * The other half of the rule, and the half that was already true: a refund
 * recorded against a purchase comes off it before the split, so the sharer's
 * benefit arrives as a smaller bill.
 */
describe('分帳者的那一份，從結算裡扣', () => {
  it('沒退稅前，我扛一半', () => {
    expect(expenseCostToViewer(bill(), OWNER, OWNER)).toBeCloseTo(37950, 0);
  });

  it('她領回 4,554 之後，我扛的變少了', () => {
    const refunded = bill({ taxRefundActual: 4554 });
    expect(expenseCostToViewer(refunded, OWNER, OWNER)).toBeCloseTo(35673, 0);
  });

  it('我少付的剛好是退稅的一半 —— 按比例，不是全額', () => {
    const before = expenseCostToViewer(bill(), OWNER, OWNER);
    const after = expenseCostToViewer(bill({ taxRefundActual: 4554 }), OWNER, OWNER);
    expect(before - after).toBeCloseTo(2277, 0);
  });

  it('她自己那邊也只少扛一半', () => {
    const before = expenseCostToViewer(bill(), GINA, OWNER);
    const after = expenseCostToViewer(bill({ taxRefundActual: 4554 }), GINA, OWNER);
    expect(before - after).toBeCloseTo(2277, 0);
  });

  it('一個人獨買的，退多少就少扛多少', () => {
    const solo = (over: Partial<Expense>) => bill({ payerId: OWNER, beneficiaries: [OWNER], ...over });
    const before = expenseCostToViewer(solo({}), OWNER, OWNER);
    const after = expenseCostToViewer(solo({ taxRefundActual: 4554 }), OWNER, OWNER);
    expect(before - after).toBeCloseTo(4554, 0);
  });
});

describe('收據上要說有沒有別人的份', () => {
  it('跟人分的帳，會標出來', () => {
    expect(sharedWithSomebody(bill({ payerId: OWNER }), OWNER, OWNER)).toBe(true);
  });

  it('自己一個人的帳，不標', () => {
    expect(sharedWithSomebody(bill({ payerId: OWNER, beneficiaries: [OWNER] }), OWNER, OWNER))
      .toBe(false);
  });
});
