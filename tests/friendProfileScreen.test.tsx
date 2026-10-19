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
  it('leaves the section out when there are none', () => {
    open({ sharedTrips: [] });

    expect(screen.queryByTestId('friend-shared-trips')).toBeNull();
  });

  it('shows their public posts, and opens one', async () => {
    const user = userEvent.setup();
    const h = open();

    await user.click(screen.getByTestId('friend-post-p1'));

    expect(h.onOpenPost).toHaveBeenCalledWith('p1');
  });

  /* An answer about them, not a question about whether the screen works. */
  it('says so when they have shared nothing', () => {
    open({ posts: [] });

    expect(screen.getByTestId('friend-no-posts').textContent).toContain('Ann');
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
