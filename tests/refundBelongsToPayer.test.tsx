/**
 * @vitest-environment jsdom
 *
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」.
 *
 * The recap's refund list was drawn from everything that concerns the reader,
 * and a bill someone else paid concerns you the moment you are split in on it.
 * So Gina's 75,900 KRW of 藥品 appeared on North's recap offering him 4,554 KRW
 * back — money that is handed to whoever carries that receipt to the refund
 * desk, which is Gina.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TripSummaryModal from '../components/TripSummaryModal';
import { Category, Expense, PaymentMethod, TaxRule } from '../types';

const KOREA: TaxRule = {
  currency: 'KRW',
  refundRate: 0.06,
  minSpend: 15000,
} as TaxRule;

/** 藥品, bought by Gina, split with North. */
const medicine = (over: Partial<Expense> = {}): Expense =>
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
    payerId: 'seat-gina',
    beneficiaries: ['me', 'seat-gina'],
    splitMethod: 'EQUAL',
    splitAllocations: {},
    ...over,
  }) as Expense;

const recapFor = (viewer: string, expenses: Expense[]) =>
  render(
    <TripSummaryModal
      expenses={expenses}
      onArchive={() => {}}
      taxRule={KOREA}
      variant="embedded"
      initialTripName="釜山"
      allowArchive={false}
      viewerMemberId={viewer}
      ownerMemberId="me"
    />,
  );

afterEach(cleanup);

describe('退稅清單只列我能去領的', () => {
  it('她付的藥品不出現在我的退稅清單', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).not.toContain('藥品');
  });

  it('同一筆在她自己的畫面上還在', () => {
    recapFor('seat-gina', [medicine()]);
    expect(document.body.textContent).toContain('藥品');
  });

  it('我自己付的，當然還在', () => {
    recapFor('me', [medicine({ payerId: 'me' })]);
    expect(document.body.textContent).toContain('藥品');
  });

  /**
   * The amount, not only the row: a total that still counts her receipt is the
   * same wrong promise, made without naming what it came from.
   */
  it('金額也不會偷偷算進去', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).not.toContain('4,554');
  });

  it('沒有分帳對象的單人旅程照樣算', () => {
    recapFor('me', [medicine({ payerId: undefined, beneficiaries: [] })]);
    expect(document.body.textContent).toContain('藥品');
  });
});
