/**
 * @vitest-environment jsdom
 *
 * 他人的個人檔案 and the 查看全部 shelf behind it.
 *
 * The quiet mistakes here are about counting and about promises. A profile
 * that states a figure this device computed is a profile lying about a
 * stranger; a 私人 tab shown to a visitor is a promise that can never be kept.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import FriendProfileScreen from '../components/FriendProfileScreen';
import PublishedShelfScreen from '../components/PublishedShelfScreen';
import { PublishedTripCard } from '../types';
import { PublishedCollectionCard } from '../components/PublishedCards';

const person = { id: 'ann', displayName: 'Ann', bio: '用旅行收藏生活' } as never;

const trip = (id: string, patch: Partial<PublishedTripCard> = {}): PublishedTripCard => ({
  id,
  name: '東京 7 日旅行',
  startDate: '2026-03-12',
  endDate: '2026-03-18',
  stopCount: 32,
  saveCount: 5200,
  ...patch,
});

const collection = (id: string): PublishedCollectionCard => ({
  id, title: '東京咖啡地圖', country: '日本', city: '東京', itemCount: 35, saveCount: 4800,
});

const profile = (props: Partial<React.ComponentProps<typeof FriendProfileScreen>> = {}) => {
  const handlers = {
    onBack: vi.fn(),
    onToggleFollow: vi.fn(),
    onOpenPublishedTrip: vi.fn(),
    onOpenPublishedCollection: vi.fn(),
    onSeeAllTrips: vi.fn(),
  };
  render(
    <FriendProfileScreen
      person={person}
      posts={[]}
      sharedTrips={[]}
      publishedTrips={[trip('t1')]}
      publishedCollections={[collection('c1')]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('the three figures under their name', () => {
  it('states what the server counted', () => {
    profile({ counts: { tripCount: 12, cityCount: 8, collectionCount: 4, saveCount: 126 } });

    expect(screen.getByTestId('friend-stat-trips').textContent).toContain('12');
    expect(screen.getByTestId('friend-stat-cities').textContent).toContain('8');
    expect(screen.getByTestId('friend-stat-saves').textContent).toContain('126');
  });

  /*
    A figure this device invented is worse than no figure. One trip is loaded
    and twelve exist; writing 1 would be this screen lying about a stranger.
  */
  it('says nothing rather than counting what it happens to hold', () => {
    profile();

    expect(screen.getByTestId('friend-stat-trips').textContent).toContain('—');
  });

  it('writes a large figure so a person can read it', () => {
    profile({ counts: { tripCount: 1, cityCount: 1, collectionCount: 1, saveCount: 4800 } });

    expect(screen.getByTestId('friend-stat-saves').textContent).toContain('4.8K');
  });
});

describe('what they published', () => {
  it('opens on their trips and opens one', async () => {
    const handlers = profile();

    await userEvent.click(screen.getByTestId('published-trip-card-t1'));

    expect(handlers.onOpenPublishedTrip).toHaveBeenCalledWith('t1');
  });

  it('shows their collections behind the 收藏 tab', async () => {
    const handlers = profile();

    await userEvent.click(screen.getByTestId('friend-profile-tab-collections'));
    await userEvent.click(screen.getByTestId('published-collection-card-c1'));

    expect(handlers.onOpenPublishedCollection).toHaveBeenCalledWith('c1');
  });

  /* 查看全部 is a lie when everything is already on the screen. */
  it('offers 查看全部 only when there is more behind it', () => {
    profile({ counts: { tripCount: 12, cityCount: 8, collectionCount: 4, saveCount: 0 } });

    expect(screen.getByText('查看全部')).toBeTruthy();
  });

  it('hides 查看全部 when the list is already whole', () => {
    profile({ counts: { tripCount: 1, cityCount: 1, collectionCount: 1, saveCount: 0 } });

    expect(screen.queryByText('查看全部')).toBeNull();
  });

  it('says so rather than leaving a gap when they published nothing', () => {
    profile({ publishedTrips: [] });

    expect(screen.getByTestId('friend-no-trips').textContent).toContain('Ann');
  });
});

describe('追蹤', () => {
  it('offers to follow, and says so once following', () => {
    const handlers = profile();
    expect(screen.getByTestId('friend-profile-follow').textContent).toContain('追蹤');

    cleanup();
    profile({ following: true });
    expect(screen.getByTestId('friend-profile-follow').textContent).toContain('追蹤中');
    expect(handlers.onToggleFollow).not.toHaveBeenCalled();
  });
});

const shelf = (props: Partial<React.ComponentProps<typeof PublishedShelfScreen>> = {}) => {
  const handlers = { onBack: vi.fn(), onOpenTrip: vi.fn() };
  render(<PublishedShelfScreen title="Ann 的旅行" trips={[trip('t1')]} {...handlers} {...props} />);
  return handlers;
};

describe('查看全部', () => {
  it('lists the trips and opens one', async () => {
    const handlers = shelf();

    await userEvent.click(screen.getByTestId('published-trip-card-t1'));

    expect(handlers.onOpenTrip).toHaveBeenCalledWith('t1');
  });

  /*
    A stranger's 私人 shelf is empty by construction and always will be. A tab
    that can never hold anything is a promise this screen cannot keep.
  */
  it('shows no 私人 tab on somebody else’s shelf', () => {
    shelf();

    expect(screen.queryByTestId('published-shelf-tab-private')).toBeNull();
  });

  it('shows both tabs on your own', async () => {
    shelf({ mine: true, privateTrips: [trip('t2', { name: '京都 5 日旅行' })] });

    await userEvent.click(screen.getByTestId('published-shelf-tab-private'));

    expect(screen.getByTestId('published-trip-card-t2')).toBeTruthy();
    expect(screen.queryByTestId('published-trip-card-t1')).toBeNull();
  });

  it('says what an empty shelf means', () => {
    shelf({ trips: [] });

    expect(screen.getByTestId('published-shelf-empty').textContent).toContain('還沒有公開');
  });
});
