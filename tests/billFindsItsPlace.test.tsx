/**
 * @vitest-environment jsdom
 *
 * 「他有給地址跟店名」, and the bill still matched no saved place.
 *
 * `merchantPlaceId` is only written when the place service returned an address
 * bearing the same street number the receipt printed. A restaurant on the
 * fourth floor of a named building routinely misses that, so the bill looks
 * fully resolved — 黑船亭 洋食料理 / KUROFUNE-TEI / 東京都台東区上野2-13-13キク
 * ヤビル4F — and carries no id at all.
 *
 * The lookup is offered on the bill itself, prefilled from what the till
 * printed. The candidates are still a list: a receipt bound to the wrong shop
 * is worse than one bound to none.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Expense } from '../types';

const findPlaceCandidates = vi.fn();
const resolveCandidate = vi.fn();

vi.mock('../services/placeCandidates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/placeCandidates')>();
  return {
    ...actual,
    findPlaceCandidates: (...args: unknown[]) => findPlaceCandidates(...args),
    resolveCandidate: (...args: unknown[]) => resolveCandidate(...args),
  };
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const bill = (over: Partial<Expense> = {}): Expense => ({
  id: 'e', date: '2026-10-20', description: '黑船亭 洋食料理', twdAmount: 882,
  amount: 4300, currency: 'JPY', exchangeRate: 0.205,
  category: '餐飲', phase: 'during',
  merchant: 'KUROFUNE-TEI',
  merchantAddress: '東京都台東区上野2-13-13キクヤビル4F',
  beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {}, payerAllocations: {},
  ...over,
} as Expense);

const open = (initialData: Expense, onSubmit = vi.fn()) => {
  render(
    <ExpenseForm
      initialData={initialData}
      onSubmit={onSubmit}
      onClose={vi.fn()}
      companions={[]}
      currentPhase={'during' as never}
      customCategories={{} as never}
      existingExpenses={[]}
      onAddCustomCategory={vi.fn()}
      onRemoveCustomCategory={vi.fn()}
    />,
  );
  return onSubmit;
};

describe('a bill whose address resolved to nothing', () => {
  it('offers to look the place up', () => {
    open(bill());

    expect(screen.getByTestId('open-add-place').textContent).toContain('對應到地圖地點');
  });

  /* Prefilled and searched from what the till printed, not retyped. */
  it('searches on what is already on the receipt', async () => {
    findPlaceCandidates.mockResolvedValue([]);
    open(bill());

    fireEvent.click(screen.getByTestId('open-add-place'));

    await waitFor(() => expect(findPlaceCandidates).toHaveBeenCalled());
    const [query] = findPlaceCandidates.mock.calls[0];
    expect(query).toContain('KUROFUNE-TEI');
    expect(query).toContain('東京都台東区上野2-13-13');
  });

  /* Chosen from a list, never bound silently. */
  it('says what was chosen, and that saving is what writes it', async () => {
    findPlaceCandidates.mockResolvedValue([{ placeId: 'ChIJ-k', name: '黒船亭' }]);
    resolveCandidate.mockResolvedValue({
      placeId: 'ChIJ-k', placeName: '黒船亭', latitude: 35.7108, longitude: 139.7753,
    });
    open(bill());

    fireEvent.click(screen.getByTestId('open-add-place'));
    const pick = await screen.findByTestId('add-place-pick-ChIJ-k');
    fireEvent.click(pick);

    await waitFor(() => expect(screen.getByTestId('expense-merchant-linked').textContent)
      .toContain('黒船亭'));
  });

  /* A bill that already has a place is not asked about again. */
  it('does not offer the lookup when the scan already found one', () => {
    open(bill({ merchantPlaceId: 'ChIJ-already' }));

    expect(screen.queryByTestId('open-add-place')).toBeNull();
  });
});

/**
 * 「這間店在收藏中有 但沒給收據 在記帳中就無法出現地址讓AI配對收藏的店家」.
 *
 * The lookup used to require a printed address, so a bill typed by hand could
 * never be bound to anything. A typed bill has no address by definition — it
 * has a name, and a name is what a search takes.
 */
describe('a bill somebody typed', () => {
  const typed = bill({
    merchant: undefined,
    merchantAddress: undefined,
    description: '八十八淺草抹茶🍵',
  });

  it('offers the lookup anyway', () => {
    open(typed);

    expect(screen.getByTestId('open-add-place')).toBeTruthy();
  });

  it('searches on what the traveller called it, without the emoji', async () => {
    findPlaceCandidates.mockResolvedValue([]);
    open(typed);

    fireEvent.click(screen.getByTestId('open-add-place'));

    await waitFor(() => expect(findPlaceCandidates).toHaveBeenCalled());
    const [query] = findPlaceCandidates.mock.calls[0];
    expect(query).toContain('八十八淺草抹茶');
    expect(query).not.toContain('🍵');
  });

  /* Nothing to search with is nothing to offer. */
  it('does not offer it when the bill has no name at all', () => {
    open(bill({ merchant: undefined, merchantAddress: undefined, description: '' }));

    expect(screen.queryByTestId('open-add-place')).toBeNull();
  });
});

/**
 * 「這個本來不是可以 match 收藏清單了嗎」.
 *
 * A bill already bound to a place showed nothing at all — which is exactly
 * what a bill that *cannot* be bound shows. Two states, one blank space.
 */
describe('a bill that already has a place', () => {
  const bound = bill({ merchantPlaceId: 'ChIJ-already' });

  it('says so', () => {
    open(bound);

    expect(screen.getByTestId('expense-place-bound').textContent).toContain('已對應到地圖地點');
  });

  it('still does not offer the lookup unasked', () => {
    open(bound);

    expect(screen.queryByTestId('open-add-place')).toBeNull();
  });

  /* Bound to the wrong shop is a thing that happens, and is correctable. */
  it('opens the lookup when asked to change it', () => {
    open(bound);

    fireEvent.click(screen.getByTestId('rebind-expense-place'));

    expect(screen.getByTestId('open-add-place')).toBeTruthy();
  });
});
