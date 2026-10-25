/**
 * @vitest-environment jsdom
 *
 * Somebody else's trip, seen by whoever opened the link — 公開行程頁.
 *
 * The things worth asserting are the ones that do not show up while clicking
 * around: that a flight offers no bookmark, that a withheld note renders
 * nothing rather than an empty line, that a refused link says the same
 * sentence however it was refused, and that no money reaches this screen.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import PublicTripView from '../components/PublicTripView';
import { PublishedTrip, PublishedTripStop } from '../types';

const stop = (id: string, patch: Partial<PublishedTripStop> = {}): PublishedTripStop => ({
  id, time: '09:00', title: `地點 ${id}`, type: 'ACTIVITY', ...patch,
});

const trip: PublishedTrip = {
  id: 't1',
  ownerId: 'ann',
  name: '東京 7 日旅行',
  destination: '東京',
  startDate: '2026-03-12',
  endDate: '2026-03-18',
  stops: [
    stop('a', { title: '淺草寺', notes: '牛角蛋糕的必勝' }),
    stop('b', { title: '隅田川周邊散步', time: '11:30', date: '2026-03-12' }),
    stop('c', { title: '壽司大', type: 'FOOD', date: '2026-03-13', time: '13:00' }),
    stop('f', { title: '華航 CI100', type: 'FLIGHT', date: '2026-03-12', time: '07:00' }),
  ],
};

const view = (props: Partial<React.ComponentProps<typeof PublicTripView>> = {}) => {
  const handlers = {
    onSaveStop: vi.fn(),
    onSaveTrip: vi.fn(),
    onClose: vi.fn(),
    onSignIn: vi.fn(),
  };
  render(<PublicTripView trip={trip} signedIn {...handlers} {...props} />);
  return handlers;
};

afterEach(cleanup);

describe('a link that does not open onto anything', () => {
  /* 「這個不存在」 and 「這個你不能看」 are different sentences; only the first is safe. */
  it('says one sentence, whatever the reason', () => {
    view({ trip: undefined, notFound: true });

    expect(screen.getByTestId('public-trip-missing').textContent).toContain('找不到這份行程');
  });

  it('says the same thing when the trip simply is not there', () => {
    view({ trip: undefined });

    expect(screen.getByTestId('public-trip-missing')).toBeTruthy();
  });
});

describe('the trip a visitor reads', () => {
  it('counts the days from the dates the owner set', () => {
    view();

    expect(screen.getByTestId('public-trip-days').textContent).toContain('7 天');
  });

  /* A count that disagrees with the list it opens is the recurring defect. */
  it('counts every stop, flights included', () => {
    view();

    expect(screen.getByTestId('public-trip-stop-count').textContent).toContain('4 個地點');
  });

  it('writes a large save count so a person can read it', () => {
    view({ saveCount: 5200 });

    expect(screen.getByTestId('public-trip-saves').textContent).toContain('5.2K 收藏');
  });

  it('shows the owner note it was given', () => {
    view();

    expect(screen.getByText('牛角蛋糕的必勝')).toBeTruthy();
  });

  /*
    The withheld half. `read_public_trip` omits a note the owner did not share,
    so there is nothing to render — never an empty paragraph where the
    traveller sees their own writing.
  */
  it('renders nothing at all for a note that was withheld', () => {
    view({
      trip: { ...trip, stops: [stop('a', { title: '淺草寺' })] },
    });

    expect(screen.getByTestId('public-trip-stop-a').textContent).toContain('淺草寺');
    expect(screen.queryByText('牛角蛋糕的必勝')).toBeNull();
  });
});

describe('saving', () => {
  it('saves one stop from its own bookmark', async () => {
    const handlers = view();

    await userEvent.click(screen.getByTestId('public-trip-save-stop-a'));

    expect(handlers.onSaveStop).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  /* 「華航 CI100」 in somebody's 收藏 is a row they can never use. */
  it('offers no bookmark on a flight', () => {
    view();

    expect(screen.queryByTestId('public-trip-save-stop-f')).toBeNull();
  });

  it('saves the whole trip without the flight', async () => {
    const handlers = view();

    await userEvent.click(screen.getByTestId('public-trip-save-all'));

    expect(handlers.onSaveTrip).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' }),
      expect.objectContaining({ id: 'c' }),
    ]);
  });

  /*
    Said before the tap, not after. A save has to belong to somebody, and
    finding that out having already chosen is finding it out too late.
  */
  it('asks a signed-out visitor to sign in instead of failing', async () => {
    const handlers = view({ signedIn: false });

    expect(screen.queryByTestId('public-trip-save-all')).toBeNull();
    await userEvent.click(screen.getByTestId('public-trip-sign-in'));

    expect(handlers.onSignIn).toHaveBeenCalled();
  });

  it('marks a stop this visitor already saved', () => {
    view({ savedStopIds: ['a'] });

    expect(screen.getByTestId('public-trip-save-stop-a').getAttribute('aria-label')).toBe('已收藏');
  });
});

describe('the days', () => {
  it('opens on Day 1 and switches', async () => {
    view();

    expect(screen.getByTestId('public-trip-stop-a')).toBeTruthy();
    await userEvent.click(screen.getByTestId('public-trip-day-2'));

    expect(screen.getByTestId('public-trip-stop-c')).toBeTruthy();
    expect(screen.queryByTestId('public-trip-stop-a')).toBeNull();
  });

  it('lists only savable stops under 景點', async () => {
    view();

    await userEvent.click(screen.getByTestId('public-trip-tab-places'));

    expect(screen.getByTestId('public-trip-places-tab')).toBeTruthy();
    expect(screen.queryByTestId('public-trip-stop-f')).toBeNull();
    expect(screen.getByTestId('public-trip-stop-c')).toBeTruthy();
  });

  it('says so rather than drawing an empty map', async () => {
    view();

    await userEvent.click(screen.getByTestId('public-trip-tab-map'));

    expect(screen.getByTestId('public-trip-map-tab').textContent).toContain('畫不出地圖');
  });

  it('draws the map when the stops have coordinates', async () => {
    view({
      trip: {
        ...trip,
        stops: [stop('a', { latitude: 35.7, longitude: 139.8 })],
      },
    });

    await userEvent.click(screen.getByTestId('public-trip-tab-map'));

    expect(screen.getByRole('img', { name: /地圖/ })).toBeTruthy();
  });
});

/**
 * The promise worth testing twice: a visitor is a reader, not a traveller.
 *
 * `read_public_trip` sends no expenses, so there is nothing here to hide — but
 * a future prop could reintroduce one, and this is the line that would fail.
 */
describe('what never reaches this screen', () => {
  it('shows no money anywhere', () => {
    view();

    const page = screen.getByTestId('public-trip');
    expect(page.textContent).not.toMatch(/NT\$|¥|分帳|結算|花費/);
  });
});
