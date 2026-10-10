/**
 * @vitest-environment jsdom
 *
 * 「這頁請百分之百還原！」
 *
 * The 旅行 home had drifted from the design in four places: the header was
 * missing its overflow control, the search field under 下一趟去哪裡？ was absent
 * entirely, the quick-start row had three tiles instead of four and no
 * subtitles, and a 快速開始 heading had been added that the design does not
 * have.
 *
 * The search field is the one that mattered beyond looks: this screen is four
 * horizontally-scrolling strips of the traveller's own trips, and without it
 * finding a named trip means scrolling three of them.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import TravelHome from '../components/TravelHome';
import { TripDraft } from '../services/tripPersistence';
import { Trip } from '../types';

const draft = (id: string, name: string, destination: string): TripDraft =>
  ({
    id,
    name,
    destination,
    startDate: '2026-10-02',
    endDate: '2026-10-07',
    expenses: [],
  }) as unknown as TripDraft;

const finished = (id: string, name: string): Trip =>
  ({
    id,
    name,
    destination: name,
    startDate: '2025-09-01',
    endDate: '2025-09-05',
    expenses: [],
  }) as unknown as Trip;

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

describe('標題列', () => {
  it('鈴鐺、搜尋、更多，三個都在', () => {
    home();
    expect(screen.getByTestId('open-notifications')).toBeTruthy();
    expect(screen.getByTestId('focus-travel-search')).toBeTruthy();
    expect(screen.getByTestId('travel-more')).toBeTruthy();
  });

  it('放大鏡會把游標送進搜尋框，不是一個擺著好看的按鈕', async () => {
    const user = userEvent.setup();
    home();

    await user.click(screen.getByTestId('focus-travel-search'));

    expect(document.activeElement).toBe(screen.getByTestId('travel-search'));
  });
});

describe('搜尋框', () => {
  it('在「下一趟去哪裡？」底下，帶著設計上的提示文字', () => {
    home();
    expect(screen.getByTestId('travel-search').getAttribute('placeholder'))
      .toBe('搜尋目的地、景點或想做的事...');
  });

  it('找得到自己的旅程', async () => {
    const user = userEvent.setup();
    home({
      drafts: [draft('d1', '釜山之旅', '釜山'), draft('d2', '東京小旅行', '東京')],
      activeDraftId: 'd1',
    });

    await user.type(screen.getByTestId('travel-search'), '東京');

    expect(screen.queryByTestId('travel-hero')).toBeNull();
    expect(screen.getByText('東京小旅行')).toBeTruthy();
  });

  it('打一半就找得到，不用從頭打對', async () => {
    const user = userEvent.setup();
    home({ tripHistory: [finished('t1', '大阪之旅')] });

    await user.type(screen.getByTestId('travel-search'), '大阪');

    expect(screen.getByText('大阪之旅')).toBeTruthy();
  });

  it('找不到就說找不到，而不是給一頁空殼', async () => {
    const user = userEvent.setup();
    home({ drafts: [draft('d1', '釜山之旅', '釜山')], activeDraftId: 'd1' });

    await user.type(screen.getByTestId('travel-search'), '冰島');

    expect(screen.getByTestId('travel-search-empty').textContent).toContain('找不到「冰島」');
  });

  it('清掉搜尋，東西就全部回來', async () => {
    const user = userEvent.setup();
    home({ drafts: [draft('d1', '釜山之旅', '釜山')], activeDraftId: 'd1' });

    await user.type(screen.getByTestId('travel-search'), '冰島');
    await user.click(screen.getByTestId('clear-travel-search'));

    expect(screen.queryByTestId('travel-search-empty')).toBeNull();
    expect(screen.getByTestId('travel-hero')).toBeTruthy();
  });

  it('沒在搜尋時，不會冒出「找不到」', () => {
    home();
    expect(screen.queryByTestId('travel-search-empty')).toBeNull();
  });
});

describe('四個快速入口', () => {
  const labels = ['AI 幫我排行程', '匯入旅程資料', '新增旅程', '探索目的地'];

  it('四個都在', () => {
    home();
    labels.forEach(label => {
      expect(screen.getByTestId(`quick-start-${label}`)).toBeTruthy();
    });
  });

  it('每一個都帶著自己的說明', () => {
    home();
    const text = (label: string) =>
      screen.getByTestId(`quick-start-${label}`).textContent ?? '';
    expect(text('AI 幫我排行程')).toContain('快速生成專屬行程');
    expect(text('匯入旅程資料')).toContain('機票・住宿・訂單');
    expect(text('新增旅程')).toContain('開始規劃下一趟');
    expect(text('探索目的地')).toContain('發現靈感');
  });

  it('設計上沒有「快速開始」這個標題', () => {
    home();
    expect(screen.queryByText('快速開始')).toBeNull();
  });

  /**
   * 「不改動比例」.
   *
   * Four tiles fit across a 393pt phone at the page's px-6 with an 8px gap
   * without touching anything inside them — 80pt each, which is the width the
   * design has. The first pass grew the icon and the tile to fill the space
   * instead, which crops nothing and so looks fine in isolation, and wrong
   * beside the rest of the page.
   */
  it('格子維持設計上的比例，沒有為了塞四格而放大', () => {
    home();
    const tile = screen.getByTestId('quick-start-新增旅程');
    expect(tile.className).toContain('min-h-[94px]');

    const icon = tile.firstElementChild as HTMLElement;
    expect(icon.className).toContain('h-9');
    expect(icon.className).toContain('w-9');
  });

  it('標題與說明維持設計上的字級', () => {
    home();
    const tile = screen.getByTestId('quick-start-新增旅程');
    const [, label, hint] = Array.from(tile.children) as HTMLElement[];
    expect(label.className).toContain('text-[11px]');
    expect(hint.className).toContain('text-[9px]');
  });

  it('四格排在一列，不是捲動或換行', () => {
    home();
    const row = screen.getByTestId('quick-start-新增旅程').parentElement as HTMLElement;
    expect(row.className).toContain('grid-cols-4');
    expect(row.className).toContain('gap-2');
  });

  it('探索目的地會帶去社群，不是一個點了沒反應的格子', async () => {
    const onSectionChange = vi.fn();
    const user = userEvent.setup();
    home({ onSectionChange });

    await user.click(screen.getByTestId('quick-start-探索目的地'));

    expect(onSectionChange).toHaveBeenCalledWith('community');
  });
});
