/**
 * @vitest-environment jsdom
 *
 * 「這個帳若不是我花費的，根本不需要出現在我的帳上」.
 *
 * 「已支出 NT$ 13,388」 stood on the screen of somebody who had paid 12,500 of
 * it, the remaining 888 recorded by the traveller beside him, with nothing
 * saying so.
 *
 * The rule the Founder settled on afterwards: 「旅伴的 888 是他自己的帳 沒有指給
 * 我 那就跟我無關！」 — a bill nobody has asked him to settle is not his
 * spending and must not count against his budget. A bill she paid and split
 * with him is, and still does. The trip-wide figure is named underneath either
 * way, because hiding money is the one failure this ledger cannot afford.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WalletPreScreen from '../components/WalletPreScreen';
import { Category, PaymentMethod } from '../types';
import type { Expense } from '../types';

const ANN = 'trip:owner';
const GINA = 'seat-gina';

const expense = (fields: Partial<Expense>): Expense => ({
  id: 'e-1',
  description: '',
  amount: 100,
  currency: 'TWD',
  exchangeRate: 1,
  twdAmount: 100,
  category: Category.OTHER,
  paymentMethod: PaymentMethod.CREDIT_CARD,
  phase: 'pre',
  date: '2026-10-02',
  payerId: ANN,
  beneficiaries: [],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...fields,
});

/** Two of his, and one she paid that they are splitting. */
const ledger = [
  expense({ id: 'a', amount: 500, twdAmount: 500, category: Category.SIM_WIFI, payerId: ANN, beneficiaries: [ANN] }),
  expense({ id: 'b', amount: 12000, twdAmount: 12000, category: Category.FLIGHT, payerId: ANN, beneficiaries: [ANN, GINA] }),
  expense({ id: 'c', amount: 888, twdAmount: 888, category: Category.OTHER, payerId: GINA, beneficiaries: [ANN, GINA] }),
];

const renderWallet = (expenses: Expense[], viewerMemberId = ANN) =>
  render(
    <WalletPreScreen
      currency="TWD"
      expenses={expenses}
      onEditBudget={() => {}}
      onQuickAdd={() => {}}
      onDeleteExpense={() => {}}
      onEditExpense={() => {}}
      viewerMemberId={viewerMemberId}
      tripOwnerMemberId={ANN}
    />,
  );

afterEach(() => cleanup());

describe('the pre-trip spend summary', () => {
  it('separates what you paid from what you are settling', () => {
    renderWallet(ledger);

    /*
      His own cost, not his turnover. 「分帳完 我只出一半 所以 12000 我只花
      6000」: 500 of his own, half the 12,000 flights, half the 888 she paid
      and split with him.
    */
    expect(screen.getByText('你的實際支出')).toBeTruthy();
    expect(screen.getByText('NT$ 6,944')).toBeTruthy();
    // And what he fronted, which is the money he is owed some of back.
    expect(screen.getByTestId('fronted').textContent).toContain('12,500');
    // 888 appears as a bill as well as a figure, so count them rather than demand one.
    expect(screen.getAllByText('NT$ 12,500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NT$ 888').length).toBeGreaterThan(0);
    // Nothing is owed to a trip-wide line when the two figures agree.
    expect(screen.queryByTestId('trip-wide-spent')).toBeNull();
  });

  it('answers from the other side too', () => {
    renderWallet(ledger, GINA);

    const split = screen.getByTestId('paid-split');
    expect(split.textContent).toContain('你付的');
    expect(split.textContent).toContain('888');
  });

  it('says nothing about a split when every bill is yours', () => {
    renderWallet(ledger.filter(item => item.payerId === ANN));

    expect(screen.queryByTestId('paid-split')).toBeNull();
    expect(screen.getByText('你的實際支出')).toBeTruthy();
  });

  it('leaves her own spending out of his figure, and still names it', () => {
    // 2,000 she paid for herself and never split with him.
    const hers = expense({ id: 'd', amount: 2000, twdAmount: 2000, category: Category.SHOPPING, payerId: GINA, beneficiaries: [GINA] });

    renderWallet([...ledger, hers]);

    // His own cost is unchanged by money he was never asked to settle.
    expect(screen.getByText('NT$ 6,944')).toBeTruthy();
    // And the trip's own figure still says where the rest went.
    expect(screen.getByTestId('trip-wide-spent').textContent).toContain('15,388');
  });

  it('keeps a bill she paid and split with him inside his figure', () => {
    // The one that vanished the night before they flew: his half of her 888
    // is inside the 6,944, so dropping it would change the number.
    renderWallet(ledger);
    expect(screen.getByText('NT$ 6,944')).toBeTruthy();

    const withoutHers = ledger.filter(item => item.id !== 'c');
    cleanup();
    renderWallet(withoutHers);
    expect(screen.getByText('NT$ 6,500')).toBeTruthy();
  });
});
