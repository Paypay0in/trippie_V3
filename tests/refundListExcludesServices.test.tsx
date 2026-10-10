/**
 * @vitest-environment jsdom
 *
 * 「餐飲不能退稅啊」.
 *
 * The recap's refund list was built 「regardless of category」, so a brunch, a
 * taxi to the hotel, a perm and a fortune telling were all counted toward the
 * refund — bought in won, mid-trip, over the threshold, and none of them
 * refundable. Korea refunds goods from tax-free registered shops. The figure
 * the traveller was about to queue at the airport for was inflated by every
 * meal they ate.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TripSummaryModal from '../components/TripSummaryModal';
import { Category, Expense, PaymentMethod, TaxRule } from '../types';

const bill = (over: Partial<Expense>): Expense =>
  ({
    id: 'x',
    description: '',
    amount: 40000,
    currency: 'KRW',
    exchangeRate: 0.0237,
    twdAmount: 948,
    category: Category.FOOD,
    paymentMethod: 'CASH_FOREIGN',
    phase: 'during',
    date: '2026-10-03',
    payerId: 'me',
    beneficiaries: ['me'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

const KOREA: TaxRule = {
  currency: 'KRW',
  refundRate: 0.06,
  minSpend: 15000,
} as TaxRule;

const renderRecap = (expenses: Expense[]) =>
  render(
    <TripSummaryModal
      expenses={expenses}
      onArchive={() => {}}
      taxRule={KOREA}
      variant="embedded"
      initialTripName="釜山"
      allowArchive={false}
      viewerMemberId="me"
      ownerMemberId="me"
    />,
  );

afterEach(() => cleanup());

describe('退稅清單只收商品', () => {
  it('餐飲不進退稅清單', () => {
    renderRecap([bill({ id: 'food', description: '釜飯', category: Category.FOOD })]);
    expect(document.body.textContent).not.toContain('釜飯');
  });

  it('交通不進退稅清單', () => {
    renderRecap([
      bill({ id: 'taxi', description: '到飯店計程車', category: Category.TRANSPORT }),
    ]);
    expect(document.body.textContent).not.toContain('到飯店計程車');
  });

  it('買的東西進退稅清單', () => {
    renderRecap([
      bill({ id: 'cup', description: '給écho 的杯子', category: Category.SOUVENIR }),
    ]);
    expect(document.body.textContent).toContain('給écho 的杯子');
  });

  it('自己標記不可退稅的，就不算', () => {
    renderRecap([
      bill({
        id: 'noref',
        description: '藍色上衣',
        category: Category.FASHION,
        taxRefundIneligible: true,
      }),
    ]);
    expect(document.body.textContent).not.toContain('藍色上衣');
  });

  it('已在結帳時退過的，不會再算一次', () => {
    renderRecap([
      bill({
        id: 'already',
        description: '小戒指',
        category: Category.ACCESSORIES,
        taxRefundedAtPurchase: true,
      }),
    ]);
    expect(document.body.textContent).not.toContain('小戒指');
  });
});

/**
 * 「這個根本不是我的帳」「我只是代墊」.
 *
 * He fronted Gina's fortune telling and split it to her alone, so his share is
 * zero. It still sat in his own category breakdown at $0, among the things he
 * had bought. The totals were right — zero adds nothing — but the list read as
 * his spending, and it was not.
 */
/** The breakdown rows live behind a per-category toggle. */
const openCategory = (category: Category) =>
  fireEvent.click(screen.getByTestId(`category-row-${category}`));

describe('代墊的帳不算在我的消費統計裡', () => {
  it('份額是 0 的不出現在分類明細', () => {
    renderRecap([
      bill({
        id: 'hers',
        description: 'Gina 海雲臺算命',
        amount: 50000,
        twdAmount: 1185,
        category: Category.OTHER,
        payerId: 'me',
        beneficiaries: ['gina'],
        splitAllocations: { gina: 1185 },
      }),
      bill({ id: 'mine', description: '生日卡片四組', amount: 8000, twdAmount: 190, category: Category.OTHER }),
    ]);
    // The category exists because of the bill he does carry a share of; his
    // share of hers is zero, so only one of the two is his to read.
    openCategory(Category.OTHER);
    expect(document.body.textContent).toContain('生日卡片四組');
    expect(document.body.textContent).not.toContain('Gina 海雲臺算命');
  });

  it('我真的有份的還是算', () => {
    renderRecap([
      bill({
        id: 'ours',
        description: '大師兄牛肉麵',
        amount: 30000,
        twdAmount: 726,
        category: Category.FOOD,
        beneficiaries: ['me', 'gina'],
      }),
    ]);
    openCategory(Category.FOOD);
    expect(document.body.textContent).toContain('大師兄牛肉麵');
  });
});

/**
 * 「我覺得退稅入帳可以直接放進去這個綠色框框」「只要在結算的時候放入這 recap 就好」
 * 「在機場後才退稅的 他會顯示退成現金或是退成信用卡」.
 *
 * A refund was written as a negative expense, so it sat in 返程支出／機場消費
 * among the purchases — reading as a −70 TWD buy, and printed as +TWD 0 because
 * the share calculation floors at zero. Money coming back is not spending.
 */
const refund = (over: Partial<Expense> = {}): Expense =>
  bill({
    id: 'refund',
    description: '退稅入帳 (Tax Refund)',
    amount: -3000,
    twdAmount: -71,
    category: Category.OTHER,
    phase: 'post',
    date: '2026-10-10',
    paymentMethod: PaymentMethod.CREDIT_CARD,
    ...over,
  });

describe('退稅只出現在結算，不出現在支出清單', () => {
  it('退稅不列在返程／機場消費的明細裡', () => {
    renderRecap([
      refund(),
      bill({ id: 'duty', description: '機場免稅店', category: Category.COSMETICS, phase: 'post', date: '2026-10-08' }),
    ]);
    expect(document.body.textContent).toContain('機場免稅店');
    expect(document.body.textContent).not.toContain('退稅入帳 (Tax Refund)');
  });

  it('結算卡顯示實際入帳金額，不是預估值', () => {
    renderRecap([
      refund(),
      bill({ id: 'cup', description: '杯子', category: Category.SOUVENIR }),
    ]);
    expect(document.body.textContent).toContain('退稅已入帳');
    expect(document.body.textContent).toContain('71');
  });

  it('退到信用卡會寫出來', () => {
    renderRecap([refund(), bill({ id: 'cup', description: '杯子', category: Category.SOUVENIR })]);
    expect(document.body.textContent).toContain('退到信用卡');
  });

  it('領取外幣現金也會寫出來', () => {
    renderRecap([
      refund({ paymentMethod: PaymentMethod.CASH_FOREIGN }),
      bill({ id: 'cup', description: '杯子', category: Category.SOUVENIR }),
    ]);
    expect(document.body.textContent).toContain('領取外幣現金');
  });
});
