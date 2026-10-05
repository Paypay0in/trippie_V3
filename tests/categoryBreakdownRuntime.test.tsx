/**
 * @vitest-environment jsdom
 *
 * 「這個購物寫了我花了8000多 我怎麼完全找不到這樣的總額」.
 *
 * The row was a correct number with nothing underneath it: this reader's share
 * of each bill, summed across every day of the trip, which no screen anywhere
 * lists. A total nobody can trace is a total nobody can believe.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import TripSummaryModal from '../components/TripSummaryModal';
import { Category, Expense } from '../types';

const TRIP = 'trip-busan';
const OWNER = `${TRIP}:owner`;
const GINA = 'seat-gina';

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 0, twdAmount: 0, currency: 'TWD', exchangeRate: 1,
  category: Category.SHOPPING, phase: 'during', date: '2026-10-03',
  payerId: OWNER, beneficiaries: [OWNER], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

/** Three purchases: one his alone, one split with Gina, one of hers. */
const ledger = [
  expense({ id: 'e-elephant', description: 'Blue elephant 墨鏡', amount: 112800, twdAmount: 2673, currency: 'KRW', beneficiaries: [OWNER] }),
  expense({ id: 'e-strut', description: 'Strut coffee', amount: 40000, twdAmount: 950, currency: 'KRW', payerId: GINA, beneficiaries: [OWNER, GINA] }),
  expense({ id: 'e-hers', description: 'Gina 自己的購物', amount: 20000, twdAmount: 500, currency: 'KRW', payerId: GINA, beneficiaries: [GINA] }),
];

const renderReport = () => render(
  <TripSummaryModal
    expenses={ledger}
    onArchive={() => undefined}
    variant="embedded"
    viewerMemberId={OWNER}
    ownerMemberId={OWNER}
  />,
);

afterEach(cleanup);

describe('a category total', () => {
  it('opens into the bills behind it', async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByTestId('category-row-購物'));

    const items = screen.getByTestId('category-items-購物');

    expect(items.textContent).toContain('Blue elephant 墨鏡');
    expect(items.textContent).toContain('Strut coffee');
  });

  it('shows this reader share, with the whole bill beside a split one', async () => {
    // 「你的 475」 is unrecognisable next to a receipt that says 950.
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByTestId('category-row-購物'));
    const items = screen.getByTestId('category-items-購物');

    expect(items.textContent).toContain('$475');
    expect(items.textContent).toContain('全額 $950');
  });

  it('adds up to exactly the number on the row', async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByTestId('category-row-購物'));

    // 2,673 of his own plus 475 of the split coffee. Gina's own 500 is not his.
    expect(screen.getByTestId('category-items-購物').textContent).toContain('$3,148');
  });

  it('leaves out a bill that is not this reader', async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByTestId('category-row-購物'));

    expect(screen.getByTestId('category-items-購物').textContent).not.toContain('Gina 自己的購物');
  });

  it('closes again', async () => {
    const user = userEvent.setup();
    renderReport();

    await user.click(screen.getByTestId('category-row-購物'));
    await user.click(screen.getByTestId('category-row-購物'));

    expect(screen.queryByTestId('category-items-購物')).toBeNull();
  });

  it('stays closed until asked', () => {
    renderReport();

    expect(screen.queryByTestId('category-items-購物')).toBeNull();
  });
});
