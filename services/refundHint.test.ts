import { describe, expect, it } from 'vitest';
import { qualifiesForRefund } from './refundHint';
import { Category, Expense, PaymentMethod, TaxRule } from '../types';

/**
 * 「怎麼都沒跳出可退稅的提示」.
 *
 * 耳機殼+手機殼 at 30,800 KRW and 給écho的杯子 at 18,900 KRW sat in the ledger
 * looking exactly like the 8,000 KRW card that does not qualify. The refund
 * estimate knew about both; the rows said nothing.
 */

const korea: TaxRule = { country: '韓國', currency: 'KRW', minSpend: 15000, refundRate: 0.06, notes: '' };

const purchase = (amount: number, over: Partial<Expense> = {}): Expense => ({
  id: 'e', description: '耳機殼+手機殼', amount, currency: 'KRW', exchangeRate: 0.023,
  handlingFee: 0, twdAmount: amount * 0.023, category: Category.SHOPPING,
  paymentMethod: PaymentMethod.CREDIT_CARD, phase: 'during', date: '2026-10-03',
  payerId: 'me', payerAllocations: { me: amount }, beneficiaries: [], splitMethod: 'EQUAL',
  splitAllocations: {}, disputes: [], needsReview: false, receiptPhotos: [],
  ...over,
}) as Expense;

describe('qualifiesForRefund', () => {
  it('says so for a purchase over the threshold', () => {
    expect(qualifiesForRefund(purchase(30800), korea)).toBe(true);
    expect(qualifiesForRefund(purchase(18900), korea)).toBe(true);
  });

  it('stays quiet below it', () => {
    expect(qualifiesForRefund(purchase(8000), korea)).toBe(false);
  });

  it('stays quiet about a meal', () => {
    // 釜飯 at 40,000 KRW clears the threshold and is still not refundable.
    expect(qualifiesForRefund(purchase(40000, { category: Category.FOOD }), korea)).toBe(false);
  });

  it('stays quiet once the traveller has answered', () => {
    // Each of these is an answer; a row that keeps suggesting a queue after one
    // has been given is noise.
    expect(qualifiesForRefund(purchase(30800, { taxRefundIneligible: true }), korea)).toBe(false);
    expect(qualifiesForRefund(purchase(30800, { taxRefundedAtPurchase: true }), korea)).toBe(false);
    expect(qualifiesForRefund(purchase(30800, { taxRefundActual: 1800 }), korea)).toBe(false);
  });

  it('stays quiet about a bill in another currency', () => {
    // A threshold in won cannot judge a figure in dollars.
    expect(qualifiesForRefund(purchase(30800, { currency: 'TWD' }), korea)).toBe(false);
  });

  it('stays quiet outside the trip itself', () => {
    expect(qualifiesForRefund(purchase(30800, { phase: 'pre' as never }), korea)).toBe(false);
  });

  it('stays quiet with no rule, or a rule that cannot be calculated', () => {
    expect(qualifiesForRefund(purchase(30800), null)).toBe(false);
    expect(qualifiesForRefund(purchase(30800), { ...korea, refundRate: 0 })).toBe(false);
  });
});

/**
 * 「還是有好幾筆沒有出現在這上面」.
 *
 * 給écho的杯子 and 涼草幸運草 were absent from the refund card altogether,
 * because the filter counted 購物 and nothing else — while a traveller files a
 * cup as 伴手禮 and a ring as 飾品配件. Korea refunds goods; which drawer this
 * app put them in is not the counter's business.
 */
describe('a purchase filed under another kind of shopping', () => {
  const goods = [
    Category.SOUVENIR,
    Category.COSMETICS,
    Category.ELECTRONICS,
    Category.FASHION,
    Category.ACCESSORIES,
    Category.HELP_BUY,
  ];

  goods.forEach(category => {
    it(`counts ${category}`, () => {
      expect(qualifiesForRefund(purchase(18900, { category }), korea)).toBe(true);
    });
  });

  it('still says nothing about what was never goods', () => {
    // 其他 is where a tip, a fee or a service lands as often as a thing, and a
    // refund prompt on those is a wrong answer rather than a missing one.
    expect(qualifiesForRefund(purchase(40000, { category: Category.FOOD }), korea)).toBe(false);
    expect(qualifiesForRefund(purchase(40000, { category: Category.TRANSPORT }), korea)).toBe(false);
    expect(qualifiesForRefund(purchase(40000, { category: Category.TICKET }), korea)).toBe(false);
    expect(qualifiesForRefund(purchase(40000, { category: Category.OTHER }), korea)).toBe(false);
  });
});
