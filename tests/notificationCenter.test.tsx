/**
 * @vitest-environment jsdom
 *
 * 「以後有任何通知都顯示訊息在這」.
 *
 * The bell was decoration. The one notification the app produces — a question
 * about a shared bill — only ever appeared inside the ledger of an open trip,
 * so the person being asked had to already be where the answer lives.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import CommunityHome from '../components/CommunityHome';
import { DisputeNotice } from '../services/disputeInbox';

const question: DisputeNotice = {
  id: 'e-noodle:d1:awaiting_my_answer',
  kind: 'awaiting_my_answer',
  expenseId: 'e-noodle',
  expenseDescription: '大師兄牛肉麵',
  disputeId: 'd1',
  message: '這筆我沒有吃到',
  fromMemberId: 'seat-gina',
  fromName: 'Gina',
  at: new Date().toISOString(),
};

const home = (props: Record<string, unknown> = {}) => render(
  <CommunityHome
    activeSection="community"
    onSectionChange={vi.fn()}
    onPlus={vi.fn()}
    posts={[]}
    onOpenPost={vi.fn()}
    onCreatePost={vi.fn()}
    {...props}
  />,
);

afterEach(cleanup);

describe('鈴鐺', () => {
  it('點開就是通知清單', async () => {
    const user = userEvent.setup();
    home({ notices: [question] });

    await user.click(screen.getByTestId('open-notifications'));

    expect(screen.getByTestId('notification-center').textContent).toContain('大師兄牛肉麵');
  });

  it('有未讀時帶一個紅點', () => {
    home({ notices: [question] });

    expect(screen.getByTestId('notification-dot')).toBeTruthy();
  });

  it('沒有通知就沒有紅點', () => {
    home({ notices: [] });

    expect(screen.queryByTestId('notification-dot')).toBeNull();
  });

  it('沒有通知時說出來，而不是開一個空白面板', async () => {
    const user = userEvent.setup();
    home({ notices: [] });

    await user.click(screen.getByTestId('open-notifications'));

    expect(screen.getByTestId('notifications-empty').textContent).toContain('目前沒有新通知');
  });
});

describe('一則通知', () => {
  it('寫出是誰、問了哪一筆、問了什麼', async () => {
    const user = userEvent.setup();
    home({ notices: [question] });

    await user.click(screen.getByTestId('open-notifications'));
    const row = screen.getByTestId('notification-d1');

    expect(row.textContent).toContain('Gina');
    expect(row.textContent).toContain('大師兄牛肉麵');
    expect(row.textContent).toContain('這筆我沒有吃到');
  });

  it('點下去把那一則交出去，並關掉清單', async () => {
    const onOpenNotice = vi.fn();
    const user = userEvent.setup();
    home({ notices: [question], onOpenNotice });

    await user.click(screen.getByTestId('open-notifications'));
    await user.click(screen.getByTestId('notification-d1'));

    expect(onOpenNotice).toHaveBeenCalledWith(expect.objectContaining({ expenseId: 'e-noodle' }));
    expect(screen.queryByTestId('notification-center')).toBeNull();
  });

  it('關得掉', async () => {
    const user = userEvent.setup();
    home({ notices: [question] });

    await user.click(screen.getByTestId('open-notifications'));
    await user.click(screen.getByTestId('close-notifications'));

    expect(screen.queryByTestId('notification-center')).toBeNull();
  });
});
