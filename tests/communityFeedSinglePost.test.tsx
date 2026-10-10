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
