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

const saveOnHerPhone = async (): Promise<Expense> => {
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
  await user.click(screen.getByRole('button', { name: /新增這筆支出/ }));

  expect(onSubmit).toHaveBeenCalled();
  return onSubmit.mock.calls[0][0] as Expense;
};

describe('a bill recorded with no split', () => {
  it('belongs to whoever recorded it, in all three facts', async () => {
    const saved = await saveOnHerPhone();

    expect(saved.payerId).toBe(HER_SEAT);
    expect(saved.beneficiaries).toEqual([HER_SEAT]);
    expect(saved.payerAllocations).toEqual({ [HER_SEAT]: saved.twdAmount });
  });
});
