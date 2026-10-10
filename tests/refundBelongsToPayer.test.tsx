/**
 * @vitest-environment jsdom
 *
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」, then
 * 「若某帳一起結帳 但同時可以退稅 請將退稅的總額按比例分配」.
 *
 * The refund list was built from every bill that concerns the reader, whole.
 * Gina's 75,900 KRW of 藥品 — half of which is North's — sat on his recap
 * offering him the entire 4,554 KRW back, and on hers offering the same 4,554
 * again. One receipt, promised twice.
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

/** 藥品, paid by Gina, split down the middle with North. 6% of 75,900 is 4,554. */
const medicine = (over: Partial<Expense> = {}): Expense =>
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

describe('一起結帳的退稅按比例分', () => {
  it('我只拿到我那一半，不是整筆', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).toContain('藥品');
    expect(document.body.textContent).toContain('2,277');
    expect(document.body.textContent).not.toContain('4,554');
  });

  it('她那邊也是一半 —— 同一張收據不會被承諾兩次', () => {
    recapFor('seat-gina', [medicine()]);
    expect(document.body.textContent).toContain('2,277');
    expect(document.body.textContent).not.toContain('4,554');
  });

  it('會說清楚這是份額，不然看起來就只是算錯', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).toContain('你的份額');
  });

  it('消費金額也跟著分，不會拿整張收據配半筆退稅', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).toContain('37,950');
  });

  it('自己一個人買的，整筆都在，也不會標份額', () => {
    recapFor('me', [medicine({ payerId: 'me', beneficiaries: ['me'] })]);
    expect(document.body.textContent).toContain('4,554');
    expect(document.body.textContent).not.toContain('你的份額');
  });

  /** 「我只是代墊」 — he put the money down, she carries all of the cost. */
  it('純代墊的帳，我一毛退稅都沒有', () => {
    recapFor('me', [medicine({ payerId: 'me', beneficiaries: ['seat-gina'] })]);
    expect(document.body.textContent).not.toContain('藥品');
  });

  it('完全跟我無關的帳不會出現', () => {
    recapFor('me', [medicine({ payerId: 'seat-gina', beneficiaries: ['seat-gina'] })]);
    expect(document.body.textContent).not.toContain('藥品');
  });
});
