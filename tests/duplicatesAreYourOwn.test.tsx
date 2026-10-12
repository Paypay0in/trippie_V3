/**
 * @vitest-environment jsdom
 *
 * 「這兩個按鈕是一樣的意思 另外 目前這個畫面是出現在Gina的帳本 然後這些是我的帳」.
 *
 * Two findings in one sentence, and the second is the serious one: the
 * duplicate scan read every expense on a shared trip, so the second traveller
 * opened her ledger and was asked whether to merge his receipts. Merging is an
 * edit, and `canEditExpense` gives that to the creator alone — the screen was
 * asking her to do something the permission layer would have refused.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DuplicateReceiptPrompt from '../components/DuplicateReceiptPrompt';
import { findDuplicateReceipts } from '../services/duplicateReceipts';
import { isExpenseCreator } from '../services/expensePermissions';

afterEach(cleanup);

const APP = readFileSync(resolvePath(__dirname, '../App.tsx'), 'utf8');

const OWNER = 'seat-north';
const GINA = 'seat-gina';

const expense = (id: string, createdByMemberId: string, over: Record<string, unknown> = {}) => ({
  id,
  description: '艾蒙德咖啡',
  amount: 5000,
  currency: 'KRW',
  date: '2026-10-07',
  category: 'FOOD',
  createdByMemberId,
  payerId: createdByMemberId,
  beneficiaries: [createdByMemberId],
  splitMethod: 'EQUAL',
  splitAllocations: {},
  ...over,
}) as never;

describe('whose receipts get compared', () => {
  /**
   * The filter is applied to the input, not to the pairs that come out: a
   * merge rewrites both halves, so both have to belong to the person being
   * asked. Filtering afterwards would still have built the pair.
   */
  it('finds nothing to ask Gina about when both bills are his', () => {
    const all = [
      expense('e-1', OWNER),
      expense('e-2', OWNER, { description: '機場便利商店' }),
    ];

    // Unfiltered, this is exactly the pair she was shown.
    expect(findDuplicateReceipts({ incoming: all }).length).toBeGreaterThan(0);

    const hers = all.filter(item => isExpenseCreator({
      expense: item,
      viewerMemberId: GINA,
      tripOwnerMemberId: OWNER,
    }));
    expect(hers).toHaveLength(0);
    expect(findDuplicateReceipts({ incoming: hers })).toEqual([]);
  });

  it('still asks her about two of her own', () => {
    const hers = [
      expense('e-3', GINA),
      expense('e-4', GINA, { description: '機場便利商店' }),
    ].filter(item => isExpenseCreator({
      expense: item,
      viewerMemberId: GINA,
      tripOwnerMemberId: OWNER,
    }));

    expect(hers).toHaveLength(2);
    expect(findDuplicateReceipts({ incoming: hers }).length).toBeGreaterThan(0);
  });

  /** Both scans, because a receipt of hers is compared against history too. */
  it('scopes the ledger scan and the import scan alike', () => {
    expect(APP).toContain('findDuplicateReceipts({ incoming: mine })');
    const importScan = APP.slice(APP.indexOf('const duplicates = findDuplicateReceipts({'));
    expect(importScan.slice(0, 900)).toContain('isExpenseCreator({');
  });
});

/**
 * 「這兩個按鈕是一樣的意思」 — with nothing ticked they were not merely similar,
 * they ran the same line. `merging` is empty, so both called `onResolve([])`
 * under two labels claiming to be different choices.
 */
describe('the way out', () => {
  const pair = {
    keep: expense('e-1', OWNER),
    drop: expense('e-2', OWNER, { description: '機場便利商店' }),
    reason: '同一天、同金額，很可能是同一筆',
    againstExisting: false,
  };

  it('offers one button when nothing is ticked', () => {
    render(<DuplicateReceiptPrompt pairs={[pair] as never} onResolve={vi.fn()} context="ledger" />);

    expect(screen.getByTestId('confirm-duplicates').textContent).toContain('都不是同一筆');
    expect(screen.queryByTestId('keep-all-separate')).toBeNull();
  });

  /**
   * And earns the second one back the moment there is something to abandon —
   * it is the way out without unticking each pair by hand.
   */
  it('offers the escape once a pair is ticked', () => {
    render(<DuplicateReceiptPrompt pairs={[pair] as never} onResolve={vi.fn()} context="ledger" />);

    fireEvent.click(screen.getByTestId('duplicate-pair-0'));

    expect(screen.getByTestId('confirm-duplicates').textContent).toContain('合併 1 組');
    expect(screen.getByTestId('keep-all-separate')).toBeTruthy();
  });
});
