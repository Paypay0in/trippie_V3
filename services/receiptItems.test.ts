import { describe, expect, it } from 'vitest';
import { normalizeParsedExpense } from './expenseIntake';
import { fromExpenseRow, toExpenseRow } from './tripSyncMapping';
import { Expense } from '../types';

/**
 * 「記帳部分新增可以讓用戶直接拍照上傳收據，幫用戶條列商品項目並翻譯用戶使用的語言」.
 *
 * His receipt: 베러미약국, 107,000 원, four lines of Korean and a −30,000 원
 * discount. The ledger kept the total and the shop, which is unreadable by the
 * time anybody needs it.
 */
const RECEIPT = {
  amount: 107000,
  currency: 'KRW',
  merchant: '베러미약국',
  items: [
    { name: '블루CPR 4개', translatedName: 'Blue CPR 4入', quantity: 1, amount: 120000 },
    { name: '큐립연고 마일드허브향 8g', translatedName: 'Q-Lip 軟膏 溫和草本 8g', quantity: 1, amount: 8000 },
    { name: '닥터리쥬몰 머드벤스드 립세럼', translatedName: 'Dr. Rejumol 泥漾唇部精華', quantity: 1, amount: 16000 },
    { name: '일반의약품 할인', translatedName: '一般醫藥品折扣', amount: -30000 },
  ],
};

describe('reading a receipt', () => {
  it('keeps every line, in printed order', () => {
    const parsed = normalizeParsedExpense(RECEIPT);

    expect(parsed?.items?.map(line => line.name)).toEqual([
      '블루CPR 4개', '큐립연고 마일드허브향 8g', '닥터리쥬몰 머드벤스드 립세럼', '일반의약품 할인',
    ]);
  });

  it('keeps the printed name beside the translation, never instead of it', () => {
    // The original is what is on the paper somebody is holding at a counter.
    const line = normalizeParsedExpense(RECEIPT)?.items?.[0];

    expect(line?.name).toBe('블루CPR 4개');
    expect(line?.translatedName).toBe('Blue CPR 4入');
  });

  it('keeps a discount as a negative line', () => {
    // −30,000 is why 120,000 + 8,000 + 16,000 is not the 107,000 charged.
    // Hiding it would make the receipt look wrong.
    expect(normalizeParsedExpense(RECEIPT)?.items?.[3].amount).toBe(-30000);
  });

  it('drops a translation that only repeats the original', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW', items: [{ name: 'CPR', translatedName: 'CPR' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('drops a line with no name at all', () => {
    // Numbers beside a blank name look like data and say nothing.
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW', items: [{ name: '  ', amount: 50 }, { name: '口紅', amount: 50 }],
    });

    expect(parsed?.items?.map(line => line.name)).toEqual(['口紅']);
  });

  it('records no lines at all for a receipt that had none', () => {
    expect(normalizeParsedExpense({ amount: 100, currency: 'KRW', items: [] })?.items).toBeUndefined();
    expect(normalizeParsedExpense({ amount: 100, currency: 'KRW' })?.items).toBeUndefined();
  });

  it('ignores anything in the list that is not a line', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW', items: ['口紅', null, 42, { name: '口紅' }],
    });

    expect(parsed?.items).toHaveLength(1);
  });

  it('keeps the shop as printed', () => {
    expect(normalizeParsedExpense(RECEIPT)?.merchant).toBe('베러미약국');
  });
});

describe('the lines travelling with the bill', () => {
  const expense = {
    id: 'e-pharmacy', description: '藥局', amount: 107000, currency: 'KRW', exchangeRate: 0.023,
    twdAmount: 2461, category: '購物', paymentMethod: '信用卡', phase: 'during', date: '2026-10-05',
    payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
    receiptItems: [{ name: '블루CPR 4개', translatedName: 'Blue CPR 4入', amount: 120000 }],
  } as unknown as Expense;

  it('survives the round trip to the shared table', () => {
    // Both travellers settle from the same bill, so what the bill was for
    // belongs on it rather than on whichever phone took the photo.
    const back = fromExpenseRow(toExpenseRow(expense, 'trip-1') as never);

    expect(back.receiptItems).toEqual(expense.receiptItems);
  });

  it('reads a row written before the column existed as having none', () => {
    const row = toExpenseRow(expense, 'trip-1') as Record<string, unknown>;
    delete row.receipt_items;

    expect(fromExpenseRow(row as never).receiptItems).toBeUndefined();
  });
});

/**
 * 「會代入但不會翻譯」 — 광안리 대교밀면 went into the title untranslated, so the
 * ledger could not be read at a glance.
 */
describe('the shop, in both languages', () => {
  it('keeps the printed name alongside the translated title', () => {
    const parsed = normalizeParsedExpense({
      amount: 22000, currency: 'KRW', description: '廣安里 大橋麥麵', merchant: '광안리 대교밀면',
    });

    expect(parsed?.description).toBe('廣安里 大橋麥麵');
    expect(parsed?.merchant).toBe('광안리 대교밀면');
  });

  it('carries the shop through the shared table', () => {
    const expense = {
      id: 'e-noodles', description: '廣安里 大橋麥麵', merchant: '광안리 대교밀면',
      amount: 22000, currency: 'KRW', exchangeRate: 0.023, twdAmount: 528,
      category: '餐飲', paymentMethod: '信用卡', phase: 'during', date: '2026-10-06',
      payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
    } as unknown as Expense;

    expect(fromExpenseRow(toExpenseRow(expense, 'trip-1') as never).merchant).toBe('광안리 대교밀면');
  });

  it('reads a bill with no shop recorded as having none', () => {
    expect(normalizeParsedExpense({ amount: 100, currency: 'KRW' })?.merchant).toBeUndefined();
  });
});

/**
 * 「這沒有翻譯跟項目解析」 — an Olive Young receipt.
 *
 * The lines came back as the department subtotals the shop prints (화장품,
 * 잡화) rather than the products, and the translation field held a paragraph
 * explaining that very fact.
 */
describe('a model explaining itself in a name field', () => {
  const essay = '化妝品類商品組合包裝/化妝品類商品總計(代稱分類，非單一品項，可能包含多項美妝商品)';

  it('drops the explanation and keeps the printed line', () => {
    // The caveat may even be true. It is still not what the field is for, and
    // a paragraph where 「護唇膏」 belongs is unreadable in a list.
    const parsed = normalizeParsedExpense({
      amount: 19900, currency: 'KRW', items: [{ name: '화장품', translatedName: essay, amount: 19900 }],
    });

    expect(parsed?.items?.[0].name).toBe('화장품');
    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('drops a name that explains itself in parentheses', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW',
      items: [{ name: '잡화', translatedName: '雜貨（這是收據上的分類小計）' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('drops a translation long enough to be a sentence, punctuation or not', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW',
      items: [{ name: '화장품', translatedName: '化妝品類商品組合包裝與總計金額依照收據直接列示' }],
    });

    expect(parsed?.items?.[0].translatedName).toBeUndefined();
  });

  it('keeps an ordinary product name', () => {
    const parsed = normalizeParsedExpense({
      amount: 100, currency: 'KRW',
      items: [
        { name: '큐립연고 마일드허브향 8g', translatedName: 'Q-Lip 軟膏 溫和草本 8g' },
        { name: '블루CPR', translatedName: 'Blue CPR' },
      ],
    });

    expect(parsed?.items?.map(line => line.translatedName)).toEqual(['Q-Lip 軟膏 溫和草本 8g', 'Blue CPR']);
  });
});

/**
 * 「這收據上已經有實際退稅的資訊 功能應該要識別實際退稅資訊直接帶入」.
 *
 * His Olive Young slip: GLOBAL TAXFREE 즉시환급, 판매 가격 19,000, V.A.T 1,726,
 * 즉시환급 1,000, 결제금액 18,000. The refund was already settled at the till and
 * the traveller was retyping it — or, more often, not noticing it and leaving
 * the purchase inside a refund estimate it had already been taken out of.
 */
describe('a refund the till already gave back', () => {
  const SLIP = {
    amount: 19000, currency: 'KRW', merchant: 'CJ올리브영(주) 서면역사점',
    taxRefundedAtPurchase: true, taxRefundActual: 1000, amountChargedAfterRefund: 18000,
  };

  it('records the refund and that it was settled at the till', () => {
    const parsed = normalizeParsedExpense(SLIP);

    expect(parsed?.taxRefundedAtPurchase).toBe(true);
    expect(parsed?.taxRefundActual).toBe(1000);
  });

  it('keeps the gross price as the amount, not what was charged', () => {
    // The ledger subtracts the refund from the amount wherever it asks what a
    // bill cost, so recording 18,000 here would take the 1,000 off twice.
    expect(normalizeParsedExpense(SLIP)?.amount).toBe(19000);
  });

  it('refuses a refund the receipt own numbers do not support', () => {
    // V.A.T mistaken for the refund: 19,000 − 1,726 is not 18,000, so one of
    // the three was misread and a wrong refund silently shrinks the bill.
    const parsed = normalizeParsedExpense({ ...SLIP, taxRefundActual: 1726 });

    expect(parsed?.taxRefundActual).toBeUndefined();
    expect(parsed?.taxRefundedAtPurchase).toBeUndefined();
  });

  it('accepts a slip that does not print the charged amount', () => {
    const { amountChargedAfterRefund: _unused, ...withoutCharged } = SLIP;

    expect(normalizeParsedExpense(withoutCharged)?.taxRefundActual).toBe(1000);
  });

  it('records nothing on an ordinary receipt', () => {
    expect(normalizeParsedExpense({ amount: 19000, currency: 'KRW' })?.taxRefundedAtPurchase).toBeUndefined();
  });

  it('refuses a refund larger than the purchase', () => {
    expect(normalizeParsedExpense({
      amount: 900, currency: 'KRW', taxRefundedAtPurchase: true, taxRefundActual: 1000,
    })?.taxRefundActual).toBeUndefined();
  });
});
