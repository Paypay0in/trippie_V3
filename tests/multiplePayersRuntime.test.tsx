/**
 * @vitest-environment jsdom
 *
 * 「付款者（可多人）· 選擇實際付款的人與金額」.
 *
 * The form has always kept a map of payers and the ledger has always been able
 * to read one. The submit handler in between took the first name off the map
 * and credited it the whole bill, so a 2,000 dinner North paid 1,200 of and
 * Gina 800 was stored as North paying all of it — and the settlement that
 * followed was out by 800, with nothing on any screen that disagreed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Expense } from '../types';

const OWNER = 'owner-north';
const GINA = 'seat-gina';

afterEach(cleanup);

const openForm = (onSubmit = vi.fn()) => {
  render(
    <ExpenseForm
      currentPhase="during"
      customCategories={{ pre: [], during: [], post: [], summary: [] } as never}
      onAddCustomCategory={() => undefined}
      onRemoveCustomCategory={() => undefined}
      existingExpenses={[]}
      companions={[{ id: GINA, name: 'Gina' }] as never}
      onSubmit={onSubmit}
      onClose={() => undefined}
      ownerMemberId={OWNER}
      ownerName="North"
      viewerMemberId={OWNER}
      viewerIdentified
    />,
  );
  return onSubmit;
};

/** A 2,000 bill with the split turned on, ready for the payer panel. */
const startSplitBill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText('例如：東京地鐵三日券'), '晚餐');
  await user.type(screen.getByPlaceholderText('500'), '2000');
  await user.click(screen.getByText('此筆支出需要分帳'));
};

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /新增這筆支出/ }));

describe('多人付款', () => {
  it('預設是單一付款，一個人扛全額', async () => {
    const user = userEvent.setup();
    const onSubmit = openForm();
    await startSplitBill(user);

    expect(screen.getByTestId('payer-mode-single').getAttribute('aria-pressed')).toBe('true');
    await save(user);

    const saved = onSubmit.mock.calls[0][0] as Expense;
    expect(saved.payerAllocations).toEqual({ [OWNER]: 2000 });
  });

  it('兩個人各出一部分，兩個金額都存下來', async () => {
    const user = userEvent.setup();
    const onSubmit = openForm();
    await startSplitBill(user);

    await user.click(screen.getByTestId('payer-mode-multi'));
    await user.click(screen.getByTestId(`payer-pick-${GINA}`));
    await user.clear(screen.getByTestId(`payer-amount-${OWNER}`));
    await user.type(screen.getByTestId(`payer-amount-${OWNER}`), '1200');
    await user.type(screen.getByTestId(`payer-amount-${GINA}`), '800');
    await save(user);

    const saved = onSubmit.mock.calls[0][0] as Expense;
    expect(saved.payerAllocations).toEqual({ [OWNER]: 1200, [GINA]: 800 });
  });

  it('payerId 記出錢最多的那一個', async () => {
    const user = userEvent.setup();
    const onSubmit = openForm();
    await startSplitBill(user);

    await user.click(screen.getByTestId('payer-mode-multi'));
    await user.click(screen.getByTestId(`payer-pick-${GINA}`));
    await user.clear(screen.getByTestId(`payer-amount-${OWNER}`));
    await user.type(screen.getByTestId(`payer-amount-${OWNER}`), '800');
    await user.type(screen.getByTestId(`payer-amount-${GINA}`), '1200');
    await save(user);

    expect((onSubmit.mock.calls[0][0] as Expense).payerId).toBe(GINA);
  });

  it('加起來對不上就不給存，而且說差多少', async () => {
    const user = userEvent.setup();
    const onSubmit = openForm();
    await startSplitBill(user);

    await user.click(screen.getByTestId('payer-mode-multi'));
    await user.click(screen.getByTestId(`payer-pick-${GINA}`));
    await user.clear(screen.getByTestId(`payer-amount-${OWNER}`));
    await user.type(screen.getByTestId(`payer-amount-${OWNER}`), '1200');
    await user.type(screen.getByTestId(`payer-amount-${GINA}`), '500');

    expect(screen.getByTestId('payer-error').textContent).toContain('少 NT$ 300');
    await save(user);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('「平均分配金額」把總額對半填好', async () => {
    const user = userEvent.setup();
    openForm();
    await startSplitBill(user);

    await user.click(screen.getByTestId('payer-mode-multi'));
    await user.click(screen.getByTestId(`payer-pick-${GINA}`));
    await user.click(screen.getByTestId('payer-spread-evenly'));

    expect((screen.getByTestId(`payer-amount-${OWNER}`) as HTMLInputElement).value).toBe('1000');
    expect((screen.getByTestId(`payer-amount-${GINA}`) as HTMLInputElement).value).toBe('1000');
  });

  it('底下寫出選了幾個人、總共付了多少', async () => {
    const user = userEvent.setup();
    openForm();
    await startSplitBill(user);

    await user.click(screen.getByTestId('payer-mode-multi'));
    await user.click(screen.getByTestId(`payer-pick-${GINA}`));
    await user.clear(screen.getByTestId(`payer-amount-${OWNER}`));
    await user.type(screen.getByTestId(`payer-amount-${OWNER}`), '1200');
    await user.type(screen.getByTestId(`payer-amount-${GINA}`), '800');

    expect(screen.getByTestId('payer-summary').textContent).toContain('已選 2 人');
    expect(screen.getByTestId('payer-summary').textContent).toContain('2,000');
  });

  /**
   * Switching back must leave one name behind, not a half-filled map that the
   * save path would then have to guess at.
   */
  it('切回單一付款，只留出錢最多的那個人', async () => {
    const user = userEvent.setup();
    const onSubmit = openForm();
    await startSplitBill(user);

    await user.click(screen.getByTestId('payer-mode-multi'));
    await user.click(screen.getByTestId(`payer-pick-${GINA}`));
    await user.clear(screen.getByTestId(`payer-amount-${OWNER}`));
    await user.type(screen.getByTestId(`payer-amount-${OWNER}`), '1200');
    await user.type(screen.getByTestId(`payer-amount-${GINA}`), '800');
    await user.click(screen.getByTestId('payer-mode-single'));
    await save(user);

    expect((onSubmit.mock.calls[0][0] as Expense).payerAllocations).toEqual({ [OWNER]: 2000 });
  });
});
