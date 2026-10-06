/**
 * @vitest-environment jsdom
 *
 * 「我覺得你可以跳出提示頁面 說這幾筆可能是一樣的」.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import DuplicateReceiptPrompt from '../components/DuplicateReceiptPrompt';
import { DuplicatePair } from '../services/duplicateReceipts';
import { Category, Expense } from '../types';

const bill = (over: Partial<Expense>): Expense => ({
  id: 'e', description: '', amount: 40500, twdAmount: 932, currency: 'KRW', exchangeRate: 0.023,
  category: Category.SHOPPING, phase: 'during', date: '2026-10-03',
  payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL', splitAllocations: {},
  ...over,
} as Expense);

const pair: DuplicatePair = {
  keep: bill({ id: 'e-till', description: 'OLIVE YOUNG 美妝' }),
  drop: bill({ id: 'e-card', description: '刷卡消費' }),
  confidence: 'same_day',
  againstExisting: false,
};

afterEach(cleanup);

describe('可能重複的提示', () => {
  it('說出有幾組，以及兩邊分別是什麼', () => {
    render(<DuplicateReceiptPrompt pairs={[pair]} onResolve={vi.fn()} />);

    expect(screen.getByText('有 1 組可能是同一筆')).toBeTruthy();
    expect(screen.getByText('OLIVE YOUNG 美妝')).toBeTruthy();
    expect(screen.getByText('刷卡消費')).toBeTruthy();
  });

  it('預設就是合併', () => {
    render(<DuplicateReceiptPrompt pairs={[pair]} onResolve={vi.fn()} />);

    expect(screen.getByTestId('duplicate-pair-0').getAttribute('aria-pressed')).toBe('true');
  });

  it('點一下就改成兩筆都留', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(<DuplicateReceiptPrompt pairs={[pair]} onResolve={onResolve} />);

    await user.click(screen.getByTestId('duplicate-pair-0'));
    await user.click(screen.getByTestId('confirm-duplicates'));

    expect(onResolve).toHaveBeenCalledWith([]);
  });

  it('確認後把要合併的組別交出去', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(<DuplicateReceiptPrompt pairs={[pair]} onResolve={onResolve} />);

    await user.click(screen.getByTestId('confirm-duplicates'));

    expect(onResolve).toHaveBeenCalledWith([0]);
  });

  it('一鍵全部分開記', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(<DuplicateReceiptPrompt pairs={[pair, { ...pair, keep: bill({ id: 'k2' }), drop: bill({ id: 'd2' }) }]} onResolve={onResolve} />);

    await user.click(screen.getByTestId('keep-all-separate'));

    expect(onResolve).toHaveBeenCalledWith([]);
  });

  it('帳本裡已經有的那一筆，講明白', () => {
    render(<DuplicateReceiptPrompt pairs={[{ ...pair, againstExisting: true }]} onResolve={vi.fn()} />);

    expect(document.body.textContent).toContain('帳本裡已經有這筆');
  });
});
