/**
 * @vitest-environment jsdom
 *
 * 「在記帳的帳目中希望就能順便給星等評分（但這是選填）這樣能讓用戶直接無痛紀錄他經
 * 歷的事情 也能摘取這些紀錄在收藏或是之後做總覽」.
 *
 * The one moment somebody reliably opens this app about a place they have just
 * been to is paying for it. Anywhere else, rating it is a second errand.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Expense } from '../types';

afterEach(cleanup);

const bill = (over: Partial<Expense> = {}): Expense => ({
  id: 'e', date: '2026-10-21', description: '佐藤養助 稻庭烏龍麵', twdAmount: 286,
  amount: 1300, currency: 'JPY', exchangeRate: 0.22, category: '餐飲', phase: 'during',
  beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {}, payerAllocations: {},
  ...over,
} as Expense);

const open = (initialData: Expense) => {
  const onSubmit = vi.fn();
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

const save = () => {
  const form = document.querySelector('form');
  if (form) fireEvent.submit(form);
};

describe('rating a bill', () => {
  it('offers five stars, unset', () => {
    open(bill());

    expect(screen.getByTestId('expense-rating')).toBeTruthy();
    expect(screen.getByTestId('expense-rating-1').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps what was chosen', () => {
    const onSubmit = open(bill());

    fireEvent.click(screen.getByTestId('expense-rating-4'));
    save();

    expect(onSubmit.mock.calls[0][0].rating).toBe(4);
  });

  /* Absent, not zero: most bills are a train ticket with nothing to say. */
  it('says nothing about a bill nobody rated', () => {
    const onSubmit = open(bill());

    save();

    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('rating');
  });

  /* A rating given by accident has to be removable, and there is nowhere else. */
  it('clears when the same star is pressed again', () => {
    const onSubmit = open(bill({ rating: 3 }));

    fireEvent.click(screen.getByTestId('expense-rating-3'));
    save();

    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('rating');
  });

  it('opens on the rating the bill already carries', () => {
    open(bill({ rating: 5 }));

    expect(screen.getByTestId('expense-rating-5').getAttribute('aria-pressed')).toBe('true');
  });
});
