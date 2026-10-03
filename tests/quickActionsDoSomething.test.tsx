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

const sheet = (props: Record<string, unknown> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onJoinTrip: vi.fn(),
    onCreatePost: vi.fn(),
    onCreateTrip: vi.fn(),
    onOpenBookshelf: vi.fn(),
    onAiImport: vi.fn(),
    onAddExpense: vi.fn(),
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
      on one destination. Clicking every entry must reach a different handler —
      five taps, five distinct things.
    */
    const onAddItineraryItem = vi.fn();
    const handlers = sheet({ onAddItineraryItem });
    const user = userEvent.setup();

    const labels = screen.getAllByRole('button').map(node => node.textContent as string);
    expect(labels).toHaveLength(5);
    for (const label of labels) {
      await user.click(screen.getByText(label));
    }

    const reached = [
      onAddItineraryItem,
      handlers.onJoinTrip,
      handlers.onCreateTrip,
      handlers.onOpenBookshelf,
      handlers.onAiImport,
    ];
    expect(reached.every(handler => handler.mock.calls.length === 1)).toBe(true);
  });
});
