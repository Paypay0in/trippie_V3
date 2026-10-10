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
import TravelHome from '../components/TravelHome';
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

/**
 * 「這個是「旅行」的通知 不是社群的通知」 — so the bell being exercised is the one
 * on 旅行, which is where a traveller goes to find out about their trip.
 */
const home = (props: Record<string, unknown> = {}) => render(
  <TravelHome
    activeSection="trips"
    onSectionChange={vi.fn()}
    onPlus={vi.fn()}
    drafts={[]}
    tripHistory={[]}
    activeDraftId={null}
    onContinueDraft={vi.fn()}
    onContinueTrip={vi.fn()}
    onCreateNew={vi.fn()}
    onOpenPlanner={vi.fn()}
    savedTravelInspirations={[]}
    communityPosts={[]}
    onOpenSavedDestination={vi.fn()}
    authStatus="anonymous"
    {...props}
  />,
);

afterEach(cleanup);

describe('鈴鐺在旅行，不在社群', () => {
  it('旅行的鈴鐺點開就是通知清單', async () => {
    const user = userEvent.setup();
    home({ notices: [question] });

    await user.click(screen.getByTestId('open-notifications'));

    expect(screen.getByTestId('notification-center').textContent).toContain('大師兄牛肉麵');
  });

  it('社群沒有鈴鐺', () => {
    render(
      <CommunityHome
        activeSection="community"
        onSectionChange={vi.fn()}
        onPlus={vi.fn()}
        posts={[]}
        onOpenPost={vi.fn()}
        onCreatePost={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('open-notifications')).toBeNull();
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

/**
 * 「上移到鈴鐺🔔點擊後就產生 不要在頁腳」「邊框要稍微內縮」.
 *
 * A sheet rising from the bottom is the shape of something that belongs to the
 * whole screen. This belongs to the bell that opened it, and reads as having
 * come from there only if it hangs beneath it — inset from both edges, so the
 * page it floats over stays visible around it.
 */
describe('通知面板的位置', () => {
  const openPanel = async () => {
    const user = userEvent.setup();
    home({ notices: [question] });
    await user.click(screen.getByTestId('open-notifications'));
    return screen.getByTestId('notification-center').lastElementChild as HTMLElement;
  };

  it('掛在鈴鐺下方，不是從頁腳升起', async () => {
    const panel = await openPanel();
    expect(panel.className).toContain('absolute');
    expect(panel.className).toContain('top-[calc(env(safe-area-inset-top)');
    // mt-auto is what pinned it to the bottom of the screen.
    expect(panel.className).not.toContain('mt-auto');
  });

  it('左右內縮，底下的頁面看得到', async () => {
    const panel = await openPanel();
    expect(panel.className).toContain('left-3');
    expect(panel.className).toContain('right-3');
  });
});

/**
 * 「通知改成這樣 100%還原」 — the reference is a titled panel with a row of
 * shelves across the top, an illustrated empty state, and a line at the bottom
 * saying what the bell is for. Each of those was missing.
 */
describe('百分之百還原', () => {
  const open = async (notices: DisputeNotice[] = []) => {
    const user = userEvent.setup();
    home({ notices });
    await user.click(screen.getByTestId('open-notifications'));
    return user;
  };

  it('有標題', async () => {
    await open();
    expect(screen.getByRole('heading', { name: '通知' })).toBeTruthy();
  });

  it('五個分頁都在，沒有內容的也在', async () => {
    await open();
    ['all', 'itinerary', 'settlement', 'travel', 'system'].forEach(key => {
      expect(screen.getByTestId(`notification-filter-${key}`)).toBeTruthy();
    });
    expect(screen.getByTestId('notification-filters').textContent)
      .toContain('航班與住宿');
  });

  it('預設停在「全部」', async () => {
    await open();
    expect(screen.getByTestId('notification-filter-all').getAttribute('aria-pressed')).toBe('true');
  });

  it('選一個沒有內容的分頁，就說那裡沒有東西', async () => {
    const user = await open([question]);

    expect(screen.queryByTestId('notifications-empty')).toBeNull();
    await user.click(screen.getByTestId('notification-filter-travel'));

    expect(screen.getByTestId('notifications-empty')).toBeTruthy();
    expect(screen.queryByTestId('notification-d1')).toBeNull();
  });

  it('分帳疑問歸在「分帳與收款」', async () => {
    const user = await open([question]);
    await user.click(screen.getByTestId('notification-filter-settlement'));

    expect(screen.getByTestId('notification-d1')).toBeTruthy();
  });

  it('空狀態是一張圖，不是一個關掉的鈴鐺', async () => {
    await open();
    expect(screen.getByTestId('notifications-empty-art')).toBeTruthy();
  });

  it('空狀態寫出會收到哪些通知', async () => {
    await open();
    const empty = screen.getByTestId('notifications-empty').textContent ?? '';
    expect(empty).toContain('旅伴對帳目提出的疑問會出現在這裡');
    expect(empty).toContain('例如分帳確認、行程變更、或航班提醒等');
  });

  it('底下有「小提醒」說明鈴鐺是做什麼的', async () => {
    await open();
    const tip = screen.getByTestId('notifications-tip').textContent ?? '';
    expect(tip).toContain('小提醒');
    expect(tip).toContain('當有人新增支出、提出分帳疑問、航班異動或行程變更時，我們會立即通知你！');
  });
});
