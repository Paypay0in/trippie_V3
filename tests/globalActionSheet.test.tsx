/**
 * @vitest-environment jsdom
 *
 * 「在這加批次匯入的入口吧」.
 *
 * The batch receipt reader existed, two screens away on the bookshelf — which
 * is the wrong place for it. The pile of paper is in your hand mid-trip with
 * the ledger open, and 快速操作 there offered exactly one thing: 新增支出.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import GlobalActionSheet from '../components/GlobalActionSheet';

const sheet = (props: Record<string, unknown> = {}) => render(
  <GlobalActionSheet
    context="wallet"
    onClose={vi.fn()}
    onJoinTrip={vi.fn()}
    onCreatePost={vi.fn()}
    onCreateTrip={vi.fn()}
    onOpenBookshelf={vi.fn()}
    onAiImport={vi.fn()}
    onAddExpense={vi.fn()}
    {...props}
  />,
);

afterEach(cleanup);

describe('記帳頁的快速操作', () => {
  it('有批次匯入收據的入口', () => {
    sheet({ onBatchImport: vi.fn() });

    expect(screen.getByText('批次匯入收據')).toBeTruthy();
  });

  it('點下去就交給呼叫端開檔案選擇', async () => {
    const onBatchImport = vi.fn();
    const user = userEvent.setup();
    sheet({ onBatchImport });

    await user.click(screen.getByText('批次匯入收據'));

    expect(onBatchImport).toHaveBeenCalled();
  });

  it('沒有地方可以匯入時就不提供', () => {
    // Outside the ledger an import has no trip to land in; an entry that opens
    // a picker and then drops the result is worse than no entry.
    sheet();

    expect(screen.queryByText('批次匯入收據')).toBeNull();
    expect(screen.getByText('新增支出')).toBeTruthy();
  });
});
