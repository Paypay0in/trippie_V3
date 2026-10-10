/**
 * @vitest-environment jsdom
 *
 * 「這是 Gina 的帳 這筆有部分是我的 所以這樣 但不應在這」, and the rule that settles
 * it: 「退稅的行為人依然是付總額的人 ... 該退稅不是計入分帳者的退稅總額 是變成在
 * 結算時的減掉的金額」.
 *
 * The list was built from every bill that concerns the reader, so Gina's
 * 75,900 KRW of 藥品 — half of which is North's — sat on his recap offering him
 * 4,554 KRW back, and on hers offering the same 4,554 again. One receipt,
 * promised twice, to two people who cannot both queue for it.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
    exchangeRate: 1,
    twdAmount: 75900,
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

describe('退稅清單只列我要去領的', () => {
  it('她付的藥品不出現在我的退稅清單', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).not.toContain('藥品');
  });

  it('金額也不會偷偷算進我的總額', () => {
    recapFor('me', [medicine()]);
    expect(document.body.textContent).not.toContain('4,554');
  });

  it('同一筆在她自己的畫面上是全額 —— 她領的就是全額', () => {
    recapFor('seat-gina', [medicine()]);
    expect(document.body.textContent).toContain('藥品');
    expect(document.body.textContent).toContain('4,554');
  });

  it('我自己付的，當然還在', () => {
    recapFor('me', [medicine({ payerId: 'me' })]);
    expect(document.body.textContent).toContain('藥品');
  });

  it('純代墊的也還在 —— 收據在我手上，那趟櫃檯還是我要跑', () => {
    recapFor('me', [medicine({ payerId: 'me', beneficiaries: ['seat-gina'] })]);
    expect(document.body.textContent).toContain('藥品');
  });

  it('沒有分帳對象的單人旅程照樣算', () => {
    recapFor('me', [medicine({ payerId: undefined, beneficiaries: [] })]);
    expect(document.body.textContent).toContain('藥品');
  });
});

/**
 * 「是變成在結算時的減掉的金額」 — so the row has to say that not all of what is
 * collected stays with the collector, or someone handed 4,554 at Gimhae will
 * wonder why only half of it improved their own position.
 */
describe('有旅伴份額的收據會說出來', () => {
  it('跟人分的帳，標明結算時會扣抵', () => {
    recapFor('me', [medicine({ payerId: 'me' })]);
    expect(document.body.textContent).toContain('含旅伴份額，結算時扣抵');
  });

  it('自己一個人的帳，不會多那句話', () => {
    recapFor('me', [medicine({ payerId: 'me', beneficiaries: ['me'] })]);
    expect(document.body.textContent).not.toContain('含旅伴份額');
  });
});
