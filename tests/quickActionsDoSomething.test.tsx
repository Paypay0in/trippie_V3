/**
 * @vitest-environment jsdom
 *
 * 「新增行程要點哪一個」.
 *
 * The honest answer was 「none of them」. 快速操作 offered five entries: two ways
 * to start or join a trip, one navigation, and 新增地點 / 新增筆記 — which both
 * ran the same `setViewMode('bookshelf')` behind different labels and added
 * nothing, because no add-place or add-note feature exists behind them.
 *
 * A menu called 快速操作 that cannot do the thing a traveller mid-trip actually
 * wants, while offering two buttons that answer a tap with silence, costs more
 * than the blank space where they were.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import GlobalActionSheet from '../components/GlobalActionSheet';

const sheetHandlers = () => ({
  onClose: vi.fn(),
  onJoinTrip: vi.fn(),
  onCreatePost: vi.fn(),
  onCreateTrip: vi.fn(),
  onOpenBookshelf: vi.fn(),
  onAiImport: vi.fn(),
  onAddExpense: vi.fn(),
  onImportScreenshots: vi.fn(),
});

const sheet = (props: Record<string, unknown> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onJoinTrip: vi.fn(),
    onCreatePost: vi.fn(),
    onCreateTrip: vi.fn(),
    onOpenBookshelf: vi.fn(),
    onAiImport: vi.fn(),
    onAddExpense: vi.fn(),
    onImportScreenshots: vi.fn(),
    ...props,
  };
  render(<GlobalActionSheet context="travel" {...(handlers as never)} />);
  return handlers;
};

afterEach(cleanup);

describe('旅程的快速操作', () => {
  it('旅程開著的時候，第一個就是新增行程', async () => {
    const onAddItineraryItem = vi.fn();
    const user = userEvent.setup();
    sheet({ onAddItineraryItem });

    const labels = screen.getAllByRole('button').map(node => node.textContent);
    expect(labels[0]).toBe('新增行程');

    await user.click(screen.getByText('新增行程'));
    expect(onAddItineraryItem).toHaveBeenCalled();
  });

  it('沒有開著的旅程時不提供它——沒有東西可以加進去', () => {
    sheet();

    expect(screen.queryByText('新增行程')).toBeNull();
    expect(screen.getAllByRole('button')[0].textContent).toBe('加入旅程');
  });

  it('不再有兩個通往同一個地方、而且什麼都不做的按鈕', () => {
    sheet({ onAddItineraryItem: vi.fn() });

    expect(screen.queryByText('新增地點')).toBeNull();
    expect(screen.queryByText('新增筆記')).toBeNull();
  });

  it('留下來的那個導覽寫出它真正做的事', async () => {
    const onOpenBookshelf = vi.fn();
    const user = userEvent.setup();
    sheet({ onOpenBookshelf });

    await user.click(screen.getByText('旅行書架'));

    expect(onOpenBookshelf).toHaveBeenCalled();
  });

  it('沒有兩個選項通往同一個地方', async () => {
    /*
      The actual defect, stated as a rule: 新增地點 and 新增筆記 were two labels
      on one destination. Clicking every entry must reach a different handler.

      Counted rather than hardcoded since 「匯入旅行筆記截圖」 joined the list: the
      rule is one handler per entry, and a fixed number only restates how many
      entries there happen to be today.
    */
    const onAddItineraryItem = vi.fn();
    const handlers = sheet({ onAddItineraryItem });
    const user = userEvent.setup();

    const labels = screen.getAllByRole('button').map(node => node.textContent as string);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      await user.click(screen.getByText(label));
    }

    const reached = [
      onAddItineraryItem,
      handlers.onJoinTrip,
      handlers.onCreateTrip,
      handlers.onOpenBookshelf,
      handlers.onAiImport,
      handlers.onImportScreenshots,
    ];
    expect(reached).toHaveLength(labels.length);
    expect(reached.every(handler => handler.mock.calls.length === 1)).toBe(true);
  });
});

/**
 * 「這個加號 點開希望可以有匯入旅行筆記截圖 要準備幫用戶切片」.
 *
 * The reader already existed, mounted inside the trip planner — so reaching it
 * meant opening a trip first, which is the wrong order: the screenshots arrive
 * from a friend before there is any trip to put them in.
 */
describe('從加號匯入旅行筆記截圖', () => {
  it('在旅程情境下是一個真的入口', async () => {
    const onImportScreenshots = vi.fn();
    const user = userEvent.setup();
    sheet({ onImportScreenshots });

    await user.click(screen.getByText('匯入旅行筆記截圖'));

    expect(onImportScreenshots).toHaveBeenCalled();
  });

  /*
    It replaced 「從相簿建立」, which closed the sheet and did nothing — the exact
    shape this file was written to catch.
  */
  it('社群情境下也在，而且不再是那個沒作用的「從相簿建立」', async () => {
    const onImportScreenshots = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    cleanup();
    render(<GlobalActionSheet
      context="community"
      {...sheetHandlers()}
      onImportScreenshots={onImportScreenshots}
      onClose={onClose}
    />);

    expect(screen.queryByText('從相簿建立')).toBeNull();
    await user.click(screen.getByText('匯入旅行筆記截圖'));

    expect(onImportScreenshots).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
