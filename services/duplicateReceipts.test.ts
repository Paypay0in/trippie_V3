import { describe, expect, it } from 'vitest';
import { Category, Expense, PaymentMethod } from '../types';
import { findDuplicateReceipts, mergeDuplicate } from './duplicateReceipts';

/**
 * 「一張是店家票據 一張是信用卡收據 會被建立成兩筆 因此AI要判斷有無可能是同一筆」.
 */

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'KRW', exchangeRate: 0.023,
  category: Category.FOOD, phase: 'during', date: '2026-10-03',
  payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

/** The till receipt: it knows what was bought. */
const tillReceipt = bill({
  id: 'e-till', description: '올리브영', amount: 40500, twdAmount: 932,
  merchant: 'OLIVE YOUNG', receiptItems: [{ name: '토너' }],
});
/** The card slip for the same purchase: a total and nothing else. */
const cardSlip = bill({ id: 'e-card', description: '刷卡消費', amount: 40500, twdAmount: 932 });

describe('兩張照片、同一筆消費', () => {
  it('同一天、同金額、同幣別就提出來', () => {
    const pairs = findDuplicateReceipts({ incoming: [tillReceipt, cardSlip] });

    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe('same_day');
  });

  it('留下資訊比較多的那一張', () => {
    // The slip is a number; the receipt is the purchase.
    const pairs = findDuplicateReceipts({ incoming: [cardSlip, tillReceipt] });

    expect(pairs[0].keep.id).toBe('e-till');
    expect(pairs[0].drop.id).toBe('e-card');
  });

  it('跨午夜結帳差一天也算可疑，但說得比較保留', () => {
    const pairs = findDuplicateReceipts({
      incoming: [tillReceipt, bill({ ...cardSlip, date: '2026-10-04' })],
    });

    expect(pairs[0].confidence).toBe('next_day');
  });

  it('差兩天就不是同一筆', () => {
    const pairs = findDuplicateReceipts({
      incoming: [tillReceipt, bill({ ...cardSlip, date: '2026-10-05' })],
    });

    expect(pairs).toHaveLength(0);
  });

  it('金額不同不算', () => {
    const pairs = findDuplicateReceipts({
      incoming: [tillReceipt, bill({ ...cardSlip, amount: 40000 })],
    });

    expect(pairs).toHaveLength(0);
  });

  it('幣別不同不算——同樣的數字在兩個國家是兩筆消費', () => {
    const pairs = findDuplicateReceipts({
      incoming: [tillReceipt, bill({ ...cardSlip, currency: 'JPY' })],
    });

    expect(pairs).toHaveLength(0);
  });

  it('金額是零的不拿來比對', () => {
    const pairs = findDuplicateReceipts({
      incoming: [bill({ id: 'a', amount: 0 }), bill({ id: 'b', amount: 0 })],
    });

    expect(pairs).toHaveLength(0);
  });
});

describe('和帳本裡已經有的帳比對', () => {
  it('當場手動記過、事後又拍進來，一樣抓得到', () => {
    const alreadyThere = bill({ id: 'e-typed', description: '올리브영', amount: 40500, twdAmount: 932 });

    const pairs = findDuplicateReceipts({ incoming: [cardSlip], existing: [alreadyThere] });

    expect(pairs).toHaveLength(1);
    expect(pairs[0].againstExisting).toBe(true);
    // The ledger's copy survives: it is already counted in every total.
    expect(pairs[0].keep.id).toBe('e-typed');
    expect(pairs[0].drop.id).toBe('e-card');
  });
});

describe('一張對到很多張', () => {
  it('只問一次，不是問三次', () => {
    const pairs = findDuplicateReceipts({
      incoming: [tillReceipt, cardSlip, bill({ id: 'e-third', amount: 40500, twdAmount: 932 })],
    });

    expect(pairs).toHaveLength(1);
  });
});

describe('合併', () => {
  it('把卡簽的照片留在帳上，不是丟掉', () => {
    const merged = mergeDuplicate(
      { ...tillReceipt, receiptPhotos: ['till.jpg'] },
      { ...cardSlip, receiptPhotos: ['card.jpg'] },
    );

    expect(merged.receiptPhotos).toEqual(['till.jpg', 'card.jpg']);
  });

  it('留下的那張缺的東西，從另一張補上', () => {
    const merged = mergeDuplicate(
      { ...cardSlip, receiptPhotos: [] },
      { ...tillReceipt, taxRefundedAtPurchase: true, taxRefundActual: 1200 },
    );

    expect(merged.merchant).toBe('OLIVE YOUNG');
    expect(merged.receiptItems?.length).toBe(1);
    expect(merged.taxRefundActual).toBe(1200);
  });

  it('兩邊都有的欄位，留下的那張說了算', () => {
    const merged = mergeDuplicate(
      { ...tillReceipt, note: '藥妝' },
      { ...cardSlip, note: '刷卡' },
    );

    expect(merged.merchant).toBe('OLIVE YOUNG');
    // Both notes survive: neither is a correction of the other.
    expect(merged.note).toBe('藥妝\n刷卡');
  });

  it('只有一邊知道的事情也補過去', () => {
    const merged = mergeDuplicate(
      { ...tillReceipt, paymentMethod: undefined, note: undefined },
      { ...cardSlip, paymentMethod: PaymentMethod.CREDIT_CARD, note: '末四碼 1234' },
    );

    expect(merged.paymentMethod).toBe(PaymentMethod.CREDIT_CARD);
    expect(merged.note).toBe('末四碼 1234');
  });

  it('任一張讀不確定，合併後仍然標著需確認', () => {
    const merged = mergeDuplicate(tillReceipt, { ...cardSlip, needsReview: true });

    expect(merged.needsReview).toBe(true);
  });

  it('留下的那張自己的金額不會被改掉', () => {
    const merged = mergeDuplicate(tillReceipt, cardSlip);

    expect(merged.id).toBe('e-till');
    expect(merged.amount).toBe(40500);
  });
});
