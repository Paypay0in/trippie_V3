/**
 * @vitest-environment jsdom
 *
 * 「誰付款 與 誰分擔 這件事本身就已經做完墊付這件事了」.
 *
 * Saving an expense without a split named the trip owner three times over —
 * payer, prepaid map and sole beneficiary — whoever was actually holding the
 * phone. So every bill the second traveller entered was filed as his, prepaid
 * by him, and settled against him, and the one place anyone looked for the
 * cause (the payer) was only a third of it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import ExpenseForm from '../components/ExpenseForm';
import { Expense } from '../types';

const OWNER = 'muo3ht39hl3hpfed:owner';
const HER_SEAT = 'muoal9czpaxkzw1l';

afterEach(cleanup);

const saveOnHerPhone = async (withSplit = false): Promise<Expense> => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();

  render(
    <ExpenseForm
      currentPhase="pre"
      customCategories={{ pre: [], during: [], post: [], summary: [] } as never}
      onAddCustomCategory={() => undefined}
      onRemoveCustomCategory={() => undefined}
      existingExpenses={[]}
      companions={[{ id: HER_SEAT, name: 'Gina' }] as never}
      onSubmit={onSubmit}
      onClose={() => undefined}
      ownerMemberId={OWNER}
      ownerName="Ann"
      viewerMemberId={HER_SEAT}
      viewerIdentified
    />,
  );

  await user.type(screen.getByPlaceholderText('例如：東京地鐵三日券'), '哈哈');
  await user.type(screen.getByPlaceholderText('500'), '888');
  if (withSplit) await user.click(screen.getByText('此筆支出需要分帳'));
  await user.click(screen.getByRole('button', { name: /新增這筆支出/ }));

  expect(onSubmit).toHaveBeenCalled();
  return onSubmit.mock.calls[0][0] as Expense;
};

/**
 * 「帳目中可以新增照片 剛點擊沒有反應」.
 *
 * 新增照片 was rendered disabled, titled 照片功能尚未開放 — a control that looked
 * live and answered nothing. A receipt is the evidence behind a split two
 * people settle from, so it belongs on the expense.
 */
describe('attaching a receipt', () => {
  it('opens a picker rather than doing nothing', async () => {
    const user = userEvent.setup();
    render(
      <ExpenseForm
        currentPhase="pre"
        customCategories={{ pre: [], during: [], post: [], summary: [] } as never}
        onAddCustomCategory={() => undefined}
        onRemoveCustomCategory={() => undefined}
        existingExpenses={[]}
        companions={[]}
        onSubmit={() => undefined}
        onClose={() => undefined}
        ownerMemberId={OWNER}
        ownerName="Ann"
        viewerMemberId={OWNER}
        viewerIdentified
      />,
    );

    const button = screen.getByRole('button', { name: /新增照片/ });
    expect(button.hasAttribute('disabled')).toBe(false);

    const input = screen.getByTestId('receipt-input') as HTMLInputElement;
    const clicked = vi.fn();
    input.addEventListener('click', clicked);
    await user.click(button);

    expect(clicked).toHaveBeenCalled();
    expect(input.accept).toBe('image/*');
  });

  it('shows a receipt the expense already carries, and lets it be taken back', async () => {
    const user = userEvent.setup();
    render(
      <ExpenseForm
        currentPhase="pre"
        customCategories={{ pre: [], during: [], post: [], summary: [] } as never}
        onAddCustomCategory={() => undefined}
        onRemoveCustomCategory={() => undefined}
        existingExpenses={[]}
        companions={[]}
        onSubmit={() => undefined}
        onClose={() => undefined}
        ownerMemberId={OWNER}
        ownerName="Ann"
        viewerMemberId={OWNER}
        viewerIdentified
        initialData={{
          id: 'e-1', description: '晚餐', amount: 500, twdAmount: 500, currency: 'TWD',
          exchangeRate: 1, category: '其他', paymentMethod: 'CASH_TWD', phase: 'pre',
          date: '2026-10-03', payerId: OWNER, beneficiaries: [OWNER],
          splitMethod: 'EQUAL', splitAllocations: {},
          receiptPhotos: ['data:image/jpeg;base64,AAAA'],
        } as never}
      />,
    );

    expect(screen.getByAltText('收據 1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '移除收據 1' }));
    expect(screen.queryByAltText('收據 1')).toBeNull();
  });
});

describe('a bill recorded with no split', () => {
  it('belongs to whoever recorded it, in all three facts', async () => {
    const saved = await saveOnHerPhone();

    expect(saved.payerId).toBe(HER_SEAT);
    expect(saved.beneficiaries).toEqual([HER_SEAT]);
    expect(saved.payerAllocations).toEqual({ [HER_SEAT]: saved.twdAmount });
  });

  /**
   * 「誰付款 與 誰分擔 這件事本身就已經做完墊付這件事了」.
   *
   * The form let several people be ticked as payers and carried an amount for
   * each — a second way of saying who paid, free to disagree with the first.
   * Two people each putting money down is two bills; one bill has one payer,
   * and the prepaid amount follows from it rather than being entered beside it.
   */
  /**
   * Turning 分帳 on pre-selected the trip owner as payer whoever was holding the
   * phone, so she split a bill she had paid and it saved as his — the same
   * assumption the unsplit path had just been taught not to make, now
   * disagreeing with it one toggle away.
   */
  it('opens the split on the person entering it, not the trip owner', async () => {
    const saved = await saveOnHerPhone(true);

    expect(saved.payerId).toBe(HER_SEAT);
  });

  it('records exactly one payer, and the prepaid amount follows from it', async () => {
    const saved = await saveOnHerPhone();

    expect(Object.keys(saved.payerAllocations || {})).toEqual([saved.payerId]);
    expect(saved.payerAllocations?.[saved.payerId]).toBe(saved.twdAmount);
  });
});
