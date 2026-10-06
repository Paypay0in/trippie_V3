/**
 * @vitest-environment jsdom
 *
 * 「這筆帳我要分帳，但我可能更清楚 Gina 的是多少錢 目前就會是只能先輸入我的金額
 * Gina 用總額扣掉 我希望是兩個都可以」.
 *
 * The remainder was nailed to the last beneficiary, so the form decided which
 * half of the bill the traveller was allowed to know — often the wrong half.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';

vi.mock('../services/geminiService', () => ({
  parseExpenseWithGemini: vi.fn(async () => null),
  parseImageExpenseWithGemini: vi.fn(async () => null),
  fetchCurrentExchangeRate: vi.fn(async () => 0.023),
}));

afterEach(cleanup);

const GINA = { id: 'gina', name: 'Gina' };

const renderForm = () => {
  const onSubmit = vi.fn();
  render(
    <ExpenseForm
      currentPhase="during"
      customCategories={{}}
      onAddCustomCategory={vi.fn()}
      onRemoveCustomCategory={vi.fn()}
      existingExpenses={[]}
      companions={[GINA]}
      onSubmit={onSubmit}
      onClose={vi.fn()}
    />,
  );
  return { onSubmit };
};

/** Opens 分帳 on a 38,000 KRW bill shared with Gina, split by exact amounts. */
const openExactSplit = async (user: ReturnType<typeof userEvent.setup>) => {
  const amount = document.querySelector('input[type="number"]') as HTMLInputElement;
  await user.type(amount, '38000');
  await user.click(screen.getByText('此筆支出需要分帳'));
  await user.click(await screen.findByText('指定金額'));
};

describe('an exact split', () => {
  it('starts with the companion carrying the remainder, as it always did', async () => {
    const user = userEvent.setup();
    renderForm();
    await openExactSplit(user);

    expect(screen.getByTestId('auto-split-gina')).toBeTruthy();
  });

  it('hands the remainder back when the traveller fills in the companion box', async () => {
    // 「她那份 19,000」, read off the receipt. The other box becomes the derived
    // one rather than refusing the number.
    const user = userEvent.setup();
    renderForm();
    await openExactSplit(user);

    await user.click(screen.getByTestId('split-input-gina'));
    await user.type(screen.getByTestId('split-input-gina'), '19000');

    await waitFor(() => expect(screen.queryByTestId('auto-split-gina')).toBeNull());
    expect(screen.getAllByTestId(/^auto-split-/).length).toBe(1);
  });

  it('empties the derived box when it is tapped, rather than typing beside the number', async () => {
    // Tap 「19,000」 and type 9 and the box would otherwise read 190,009.
    const user = userEvent.setup();
    renderForm();
    await openExactSplit(user);

    const ginaBox = screen.getByTestId('split-input-gina') as HTMLInputElement;
    await user.click(ginaBox);

    await waitFor(() => expect(ginaBox.value).toBe(''));
  });

  it('keeps exactly one derived box, whichever one is being typed into', async () => {
    // Two free numbers that must add to a fixed total is a form that can
    // disagree with itself.
    const user = userEvent.setup();
    renderForm();
    await openExactSplit(user);

    await user.type(screen.getByTestId('split-input-gina'), '19000');
    await waitFor(() => expect(screen.getAllByTestId(/^auto-split-/).length).toBe(1));

    const mine = screen.getByTestId(/^split-input-(?!gina)/);
    await user.type(mine, '5000');

    await waitFor(() => expect(screen.getAllByTestId(/^auto-split-/).length).toBe(1));
  });
});
