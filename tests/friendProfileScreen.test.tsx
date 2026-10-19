/**
 * @vitest-environment jsdom
 *
 * 「點擊這個好友可以看到他公開的主頁還有我們的共同旅行紀錄」.
 *
 * Two kinds of fact on one screen. Their name, cover, bio and published posts
 * are public — anybody signed in may read them, and the database decides that.
 * The trips are shared, and for anybody else that section is empty by
 * construction.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import FriendProfileScreen from '../components/FriendProfileScreen';
import type { CommunityPost } from '../types';

afterEach(cleanup);

const ANN = { id: 'u-ann', displayName: 'Ann', bio: '吃喝玩樂第一名' };

const post = (id: string, title: string): CommunityPost => ({
  id, creatorId: 'u-ann', authorName: 'Ann', title, content: '',
  country: '韓國', city: '首爾', status: 'published',
  createdAt: '2026-09-09T00:00:00.000Z',
  publishedAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
} as CommunityPost);

const open = (over: Partial<React.ComponentProps<typeof FriendProfileScreen>> = {}) => {
  const handlers = {
    person: ANN,
    posts: [post('p1', '首爾這幾個地方我下次還會再去')],
    sharedTrips: [{ id: 't1', label: '東京 2026 秋', startDate: '2026-10-20', endDate: '2026-10-24' }],
    onBack: vi.fn(),
    onOpenPost: vi.fn(),
    onOpenTrip: vi.fn(),
    ...over,
  };
  render(<FriendProfileScreen {...handlers} />);
  return handlers;
};

describe('好友的主頁', () => {
  it('shows who they are publicly', () => {
    open();

    expect(screen.getByText('Ann')).toBeTruthy();
    expect(screen.getByText('吃喝玩樂第一名')).toBeTruthy();
  });

  /*
    The address is not here, and `find_person_by_email` does not return it
    either. Knowing somebody's email is how you find them, not something
    being their friend tells you.
  */
  it('never shows an email', () => {
    open({
      person: { id: 'u-ann', displayName: 'Ann', email: 'washop0517@gmail.com' } as never,
    });

    expect(document.body.textContent).not.toContain('washop0517@gmail.com');
  });

  it('lists the trips you were both on', () => {
    open();

    /* 共同旅程 is the tab's label now, and it carries the count. */
    expect(screen.getByTestId('friend-tab-trips').textContent).toContain('共同旅程 (1)');
    expect(screen.getByTestId('friend-shared-trips').textContent).toContain('東京 2026 秋');
    expect(screen.getByTestId('friend-shared-trips').textContent).toContain('2026/10/20 – 10/24');
  });

  it('opens one of them', async () => {
    const user = userEvent.setup();
    const h = open();

    await user.click(screen.getByTestId('friend-profile-trip-t1'));

    expect(h.onOpenTrip).toHaveBeenCalledWith('t1');
  });

  /* Nobody else sees this section, because for them it is empty. */
  it('leaves the list out when there are none', () => {
    open({ sharedTrips: [] });

    expect(screen.queryByTestId('friend-shared-trips')).toBeNull();
  });

  /* The two halves are tabs now; the trips open first. */
  it('shows their public posts, and opens one', async () => {
    const user = userEvent.setup();
    const h = open();

    await user.click(screen.getByTestId('friend-tab-posts'));
    await user.click(screen.getByTestId('friend-post-p1'));

    expect(h.onOpenPost).toHaveBeenCalledWith('p1');
  });

  /* An answer about them, not a question about whether the screen works. */
  it('says so when they have shared nothing', async () => {
    const user = userEvent.setup();
    open({ posts: [] });

    await user.click(screen.getByTestId('friend-tab-posts'));

    expect(screen.getByTestId('friend-no-posts').textContent).toContain('Ann');
  });

  /* And the same for a friend there is no trip with. */
  it('says so when there is no trip together', () => {
    open({ sharedTrips: [] });

    expect(screen.getByTestId('friend-no-trips')).toBeTruthy();
    expect(screen.getByTestId('friend-tab-trips').textContent).toContain('(0)');
  });

  /*
    Opened on a desktop it ran the whole 1200px: a full-bleed cover, a tiny
    avatar in the corner, two stat numbers marooned at the far left. Every
    screen in this app is in the same column, and the one that is not is the
    one that looks broken.
  */
  it('stays in the column every other screen is in', () => {
    open();

    expect(screen.getByTestId('friend-profile').className).toContain('md:max-w-2xl');
  });

  it('goes back', async () => {
    const user = userEvent.setup();
    const h = open();

    await user.click(screen.getByTestId('friend-profile-back'));

    expect(h.onBack).toHaveBeenCalled();
  });
});

/**
 * 「將頁面優化成這樣」 — the mock the Founder drew.
 *
 * What it has and this does not: 旅伴好友, 收藏的景點, and every editing
 * control. The first two are somebody else's rows and this account cannot
 * read them — a tab that can only ever say (0) is a tab lying about a
 * stranger. The rest belong on your own profile, which is what was drawn.
 */
describe('照著稿子做的那些', () => {
  it('draws a trip as a card with where it goes', () => {
    open({
      sharedTrips: [{
        id: 't1', label: 'Tokyo', startDate: '2026-10-20', endDate: '2026-10-24',
        destination: '日本・東京', memberCount: 2,
      }],
    });

    const card = screen.getByTestId('friend-profile-trip-t1');
    expect(card.textContent).toContain('日本・東京');
    expect(card.textContent).toContain('2026/10/20 – 10/24');
    expect(card.textContent).toContain('2 人');
  });

  /* A trip that never recorded where it goes still renders as a card. */
  it('keeps the card when the trip has no destination', () => {
    open({ sharedTrips: [{ id: 't1', label: '未命名的旅程' }] });

    expect(screen.getByTestId('friend-profile-trip-t1').textContent).toContain('未命名的旅程');
  });

  /* Somebody else's friends and saves are not readable, so they are not drawn. */
  it('offers no tab it cannot answer', () => {
    open();

    expect(screen.queryByText(/旅伴好友/)).toBeNull();
    expect(screen.queryByText(/收藏的景點/)).toBeNull();
  });

  /* Nor any control that belongs on your own profile. */
  it('offers nothing to edit on somebody else', () => {
    open();

    expect(screen.queryByText(/編輯個人資料|更換封面|新增共同旅程|發布貼文/)).toBeNull();
  });
});
