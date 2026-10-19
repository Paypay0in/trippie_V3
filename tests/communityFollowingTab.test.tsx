/**
 * @vitest-environment jsdom
 *
 * 追蹤, back now that there is something behind it.
 *
 * It once sat beside 發現 and did nothing: the feed filtered on `status` alone
 * and `tab` was in the dependency array without ever being read — three
 * choices, one behaviour. The table it needed is migration 0025, run
 * 2026-10-18.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CommunityHome from '../components/CommunityHome';
import type { CommunityPost } from '../types';

afterEach(cleanup);

const post = (id: string, creatorId: string, title: string): CommunityPost =>
  ({
    id, creatorId, authorName: creatorId, title, content: '',
    country: '韓國', city: '首爾', status: 'published',
    createdAt: '2026-10-01T00:00:00.000Z',
    publishedAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }) as CommunityPost;

const posts = [
  post('p1', 'ann', '安的釜山'),
  post('p2', 'stranger', '陌生人的東京'),
];

const renderFeed = (friendIds?: string[]) => render(
  <CommunityHome
    posts={posts}
    friendIds={friendIds}
    activeSection="community"
    onSectionChange={() => {}}
    onPlus={() => {}}
    onOpenPost={() => {}}
    onCreatePost={() => {}}
  />,
);

describe('追蹤', () => {
  it('is offered once somebody is signed in', () => {
    renderFeed([]);

    expect(screen.getByText('追蹤')).toBeTruthy();
  });

  /* Nobody signed in has no such question to ask. */
  it('is not offered to a visitor', () => {
    renderFeed(undefined);

    expect(screen.queryByText('追蹤')).toBeNull();
  });

  it('shows only the posts of people this traveller accepted', () => {
    renderFeed(['ann']);

    fireEvent.click(screen.getByText('追蹤'));

    expect(screen.getByText('安的釜山')).toBeTruthy();
    expect(screen.queryByText('陌生人的東京')).toBeNull();
  });

  /* Signed in with no friends yet is an answer, and it is empty. */
  it('is empty rather than full when nobody has been added', () => {
    renderFeed([]);

    fireEvent.click(screen.getByText('追蹤'));

    expect(screen.queryByText('安的釜山')).toBeNull();
    expect(screen.queryByTestId('community-feed')).toBeNull();
  });

  it('leaves 發現 showing everything', () => {
    renderFeed(['ann']);

    expect(screen.getByText('安的釜山')).toBeTruthy();
    expect(screen.getByText('陌生人的東京')).toBeTruthy();
  });
});
