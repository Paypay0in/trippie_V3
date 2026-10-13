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
import { resolveViewer } from '../services/tripRoster';

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

  /**
   * 「這還是我的帳 Gina 依然收到」.
   *
   * Filtering to the viewer's own expenses was not enough. `resolveViewer`
   * answers `owner-fallback` when it cannot match the signed-in user to a
   * seat — so her device believed she was him, and his receipts passed a
   * filter that asks 「are these yours」.
   */
  it('cannot tell her apart from him when her seat is unlinked', () => {
    const roster = [
      { id: OWNER, type: 'owner', userId: 'auth-north', name: 'North' },
      // Her seat exists but was never linked to her account.
      { id: GINA, type: 'companion', name: 'Gina' },
    ] as never;

    const asGina = resolveViewer({
      roster,
      authUserId: 'auth-gina',
      tripOwnerMemberId: OWNER,
    });

    expect(asGina.isResolved).toBe(false);
    expect(asGina.memberId).toBe(OWNER);
    // Which is why his expense looks like hers to every ownership check.
    expect(isExpenseCreator({
      expense: expense('e-1', OWNER),
      viewerMemberId: asGina.memberId,
      tripOwnerMemberId: OWNER,
    })).toBe(true);
  });

  /**
   * So the scan does not run at all on a guessed identity. A merge rewrites
   * two records, and that is the one case where asking nothing is the only
   * safe answer.
   */
  it('asks nothing until it knows who is looking', () => {
    const scan = APP.slice(APP.indexOf('const dismissedDuplicatesRef'));
    const guard = scan.indexOf('if (sharedWithOthers && !viewerResolution.isResolved) return;');
    const scanCall = scan.indexOf('findDuplicateReceipts({ incoming: mine })');

    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(scanCall);
  });

  /**
   * And only on a shared trip. A solo traveller who never signed in is
   * unresolved too, and for them the fallback is simply correct — every
   * expense really is theirs. Refusing there would switch the feature off for
   * the common case to protect the rare one, which an existing runtime test
   * said out loud the moment I tried it.
   */
  it('still asks a solo traveller who never signed in', () => {
    const solo = resolveViewer({
      roster: [{ id: OWNER, type: 'owner', name: 'North' }] as never,
      authUserId: undefined,
      tripOwnerMemberId: OWNER,
    });

    expect(solo.isResolved).toBe(false);
    // Nobody else on the roster, so nothing is being guessed at.
    expect(APP).toContain("const sharedWithOthers = settlementMembers.some(member => member.type !== 'owner');");
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
