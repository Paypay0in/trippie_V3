/**
 * @vitest-environment jsdom
 *
 * 我 ＞ 我的貼文 must be part of the account page itself. It was first rendered
 * as a sibling of AccountScreen, which is min-h-screen, so it sat a whole blank
 * screen below the fold and looked as though it had never been built.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import AccountScreen from '../components/AccountScreen';
import type { CommunityPost } from '../types';

afterEach(cleanup);

const post: CommunityPost = {
  id: 'post-1',
  creatorId: 'anon-user',
  authorName: 'Ann',
  title: '首爾這幾個地方我下次還會再去',
  content: '第一次去首爾最意外的是聖水洞。',
  country: '韓國',
  city: '首爾',
  status: 'published',
  createdAt: '2026-09-09T00:00:00.000Z',
  publishedAt: '2026-09-09T00:00:00.000Z',
};

const renderAccount = (overrides: Partial<React.ComponentProps<typeof AccountScreen>> = {}) => {
  const props = {
    authStatus: 'authenticated' as const,
    profile: { displayName: 'Ann', avatarUrl: '', bio: '' },
    email: 'ann@example.com',
    authAvailable: true,
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onSaveProfile: vi.fn(async () => {}),
    myPosts: [post],
    savedInspirations: [],
    completedTripCount: 3,
    onTogglePostVisibility: vi.fn(),
    onDeletePost: vi.fn(),
    onCreatePost: vi.fn(),
    onOpenPost: vi.fn(),
    ...overrides,
  };
  render(<AccountScreen {...props} />);
  return props;
};

describe('我的貼文', () => {
  it('sits inside the account page, with the post listed', () => {
    renderAccount();
    const main = screen.getByRole('main');
    // The tab is the only place the section is named now; the post itself is
    // what proves the panel rendered inside the page rather than below it.
    expect(within(main).getByRole('button', { name: /我的貼文/ })).toBeTruthy();
    expect(within(main).getByText(post.title)).toBeTruthy();
    expect(within(main).getByText('公開')).toBeTruthy();
  });

  it('offers the reversible action above the destructive one', async () => {
    const props = renderAccount();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(`貼文選項：${post.title}`));
    await user.click(screen.getByText('改為僅自己可見'));
    expect(props.onTogglePostVisibility).toHaveBeenCalledWith('post-1');

    await user.click(screen.getByLabelText(`貼文選項：${post.title}`));
    await user.click(screen.getByLabelText(`刪除貼文：${post.title}`));
    expect(props.onDeletePost).toHaveBeenCalledWith(post);
  });

  it('opens the post when the card is tapped', async () => {
    const props = renderAccount();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(`開啟貼文：${post.title}`));
    expect(props.onOpenPost).toHaveBeenCalledWith('post-1');
  });

  it('does not open the post when the ⋯ menu is tapped', async () => {
    // The menu sits on top of the card's own click target; catching the card
    // instead would take someone to the post they were trying to unpublish.
    const props = renderAccount();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(`貼文選項：${post.title}`));
    expect(props.onOpenPost).not.toHaveBeenCalled();
    expect(screen.getByText('改為僅自己可見')).toBeTruthy();
  });

  it('always offers a way to write the next one', async () => {
    const props = renderAccount({ myPosts: [] });
    const user = userEvent.setup();
    await user.click(screen.getByText('新增貼文'));
    expect(props.onCreatePost).toHaveBeenCalled();
  });

  it('shows saved inspirations under their own tab', async () => {
    renderAccount({ savedInspirations: [{ id: 's1', title: '廣藏市場', country: '韓國', city: '首爾' }] });
    const user = userEvent.setup();
    await user.click(screen.getByText('我的收藏'));
    expect(screen.getByText('廣藏市場')).toBeTruthy();
  });
});
