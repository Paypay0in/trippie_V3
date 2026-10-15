/**
 * @vitest-environment jsdom
 *
 * 「這個排版？」
 *
 * The feed is a two-column masonry, which is right once there is something to
 * balance. With one post the first column held it and the second stood empty —
 * a card down the left half of the screen and nothing beside it, which reads as
 * a layout that broke rather than a community with one story in it.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CommunityHome from '../components/CommunityHome';
import type { CommunityPost } from '../types';

const post = (id: string): CommunityPost =>
  ({
    id,
    creatorId: 'ann',
    authorName: 'Ann',
    title: `首爾這幾個地方我下次還會再去 ${id}`,
    content: '',
    country: '韓國',
    city: '首爾',
    status: 'published',
    createdAt: '2026-10-01T00:00:00.000Z',
    publishedAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }) as CommunityPost;

const renderFeed = (posts: CommunityPost[]) =>
  render(
    <CommunityHome
      posts={posts}
      activeSection="community"
      onSectionChange={() => {}}
      onPlus={() => {}}
      onOpenPost={() => {}}
      onCreatePost={() => {}}
    />,
  );

afterEach(() => cleanup());

describe('社群動態的排版', () => {
  it('只有一篇時不留一個空欄位', () => {
    renderFeed([post('a')]);
    expect(screen.getByTestId('community-feed').className).not.toContain('columns-2');
  });

  it('兩篇以上才用雙欄瀑布流', () => {
    renderFeed([post('a'), post('b')]);
    expect(screen.getByTestId('community-feed').className).toContain('columns-2');
  });
});

/**
 * 「發現頁是啥」 — a wall of other travellers' posts, and the source every saved
 * place in this app comes from. 「追蹤」 and 「下一個目的地」 sat beside it and
 * showed the same list: the feed filtered on `status` alone and `tab` was in
 * the dependency array without ever being read.
 *
 * Neither can be built yet either — 追蹤 needs the friendships table, which is
 * migration 0025 and unrun.
 */
describe('只留做得到的那個分頁', () => {
  it('不再顯示點了沒作用的分頁', () => {
    render(
      <CommunityHome
        posts={[post('a')]}
        activeSection="community"
        onSectionChange={() => {}}
        onPlus={() => {}}
        onOpenPost={() => {}}
        onCreatePost={() => {}}
      />,
    );

    expect(screen.queryByText('追蹤')).toBeNull();
    expect(screen.queryByText('下一個目的地')).toBeNull();
  });

  /* The feed itself is untouched: this removed choices, not content. */
  it('貼文照常顯示', () => {
    render(
      <CommunityHome
        posts={[post('a')]}
        activeSection="community"
        onSectionChange={() => {}}
        onPlus={() => {}}
        onOpenPost={() => {}}
        onCreatePost={() => {}}
      />,
    );

    expect(screen.getByTestId('community-feed')).toBeTruthy();
  });
});
