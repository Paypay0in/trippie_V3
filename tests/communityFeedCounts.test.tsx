/**
 * @vitest-environment jsdom
 *
 * 「有留言跟愛心數」.
 *
 * The feed card had a heart rendering `{isLiked ? 1 : 0}` and no comment count
 * at all — so the one number on the card was the reader's own tap dressed as a
 * public tally, and the one real signal under the post was missing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import CommunityHome from '../components/CommunityHome';
import { loadLikedPosts } from '../services/postLikes';

const post = {
  id: 'p1',
  creatorId: 'u1',
  authorName: 'Ann',
  title: '首爾這幾個地方我下次還會再去',
  content: '',
  country: '韓國',
  city: '首爾',
  status: 'published',
  createdAt: '2026-10-01',
  publishedAt: '2026-10-01',
};

const feed = (props: Record<string, unknown> = {}) => render(
  <CommunityHome
    activeSection="community"
    onSectionChange={vi.fn()}
    onPlus={vi.fn()}
    posts={[post] as never}
    onOpenPost={vi.fn()}
    onCreatePost={vi.fn()}
    {...props}
  />,
);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('貼文卡上的數字', () => {
  it('留言數是真的，0 也寫出來', () => {
    feed({ commentCounts: {} });
    expect(screen.getByTestId('feed-comments-p1').textContent).toContain('0');

    cleanup();
    feed({ commentCounts: { p1: 3 } });
    expect(screen.getByTestId('feed-comments-p1').textContent).toContain('3');
  });

  /**
   * Nobody else can see this heart and nothing counts it, so a number beside
   * it would be claiming a tally this app cannot produce.
   */
  it('愛心不帶數字 —— 它只代表「你按了」', () => {
    feed({ commentCounts: {} });
    expect(screen.getByTestId('like-p1').textContent?.trim()).toBe('');
  });

  it('按愛心會留下來，不會重整就沒了', async () => {
    const user = userEvent.setup();
    feed();

    await user.click(screen.getByTestId('like-p1'));

    expect(screen.getByTestId('like-p1').getAttribute('aria-pressed')).toBe('true');
    expect(loadLikedPosts()).toEqual(['p1']);
  });

  it('再按一次就收回', async () => {
    const user = userEvent.setup();
    feed();

    await user.click(screen.getByTestId('like-p1'));
    await user.click(screen.getByTestId('like-p1'));

    expect(screen.getByTestId('like-p1').getAttribute('aria-pressed')).toBe('false');
    expect(loadLikedPosts()).toEqual([]);
  });

  it('上次按過的，開進來就是按過的樣子', () => {
    localStorage.setItem('trippie_post_likes_v1', JSON.stringify(['p1']));
    feed();
    expect(screen.getByTestId('like-p1').getAttribute('aria-pressed')).toBe('true');
  });
});
