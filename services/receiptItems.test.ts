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
