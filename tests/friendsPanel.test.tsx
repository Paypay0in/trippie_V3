/**
 * @vitest-environment jsdom
 *
 * 「這裡要有可以加朋友的欄位」.
 *
 * Asked for before the tables exist, so the thing this must never do is
 * pretend. A lookup that cannot reach its function has two ways to answer:
 * 「查無此人」, which sends somebody off to check their friend's spelling for a
 * problem that is not theirs, or the truth.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import FriendsPanel from '../components/FriendsPanel';

const GINA = { id: 'u-gina', displayName: 'Gina' };

const panel = (props: Record<string, unknown> = {}) => {
  const handlers = {
    myEmail: 'me@example.com',
    friends: [],
    pending: [],
    onLookup: vi.fn(async () => ({ person: GINA })),
    onRequest: vi.fn(),
    onAccept: vi.fn(),
    onRemove: vi.fn(),
    ...props,
  };
  render(<FriendsPanel {...(handlers as never)} />);
  return handlers;
};

afterEach(cleanup);

describe('找朋友', () => {
  it('打完整的 Email 才查得了', async () => {
    const user = userEvent.setup();
    const h = panel();

    await user.type(screen.getByTestId('friend-email'), 'gina@');
    expect((screen.getByTestId('friend-lookup') as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByTestId('friend-email'), 'example.com');
    expect((screen.getByTestId('friend-lookup') as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByTestId('friend-lookup'));
    expect(h.onLookup).toHaveBeenCalledWith('gina@example.com');
  });

  /** Six prefix queries on the way to one address is a search, not a lookup. */
  it('打字的時候不會一直去查', async () => {
    const user = userEvent.setup();
    const h = panel();

    await user.type(screen.getByTestId('friend-email'), 'gina@example.com');

    expect(h.onLookup).not.toHaveBeenCalled();
  });

  it('找到人就可以邀請', async () => {
    const user = userEvent.setup();
    const h = panel();

    await user.type(screen.getByTestId('friend-email'), 'gina@example.com');
    await user.click(screen.getByTestId('friend-lookup'));
    await user.click(await screen.findByTestId('friend-request'));

    expect(h.onRequest).toHaveBeenCalledWith(GINA);
  });

  it('查無此人就說查無此人', async () => {
    const user = userEvent.setup();
    panel({ onLookup: vi.fn(async () => ({ person: null })) });

    await user.type(screen.getByTestId('friend-email'), 'nobody@example.com');
    await user.click(screen.getByTestId('friend-lookup'));

    expect((await screen.findByTestId('friend-none')).textContent).toContain('找不到');
  });

  it('打自己的 Email，說那是你自己', async () => {
    const user = userEvent.setup();
    const h = panel();

    await user.type(screen.getByTestId('friend-email'), 'me@example.com');
    await user.click(screen.getByTestId('friend-lookup'));

    expect(screen.getByTestId('friend-self')).toBeTruthy();
    expect(h.onLookup).not.toHaveBeenCalled();
  });

  /**
   * The branch this component was shaped around: the tables are not there yet.
   */
  it('資料表還沒建，就說資料表還沒建 —— 不是「查無此人」', async () => {
    const user = userEvent.setup();
    panel({ onLookup: vi.fn(async () => ({ problem: 'setup' })) });

    await user.type(screen.getByTestId('friend-email'), 'gina@example.com');
    await user.click(screen.getByTestId('friend-lookup'));

    const notice = await screen.findByTestId('friend-setup');
    expect(notice.textContent).toContain('資料表還沒建立');
    expect(notice.textContent).toContain('不是你打錯');
    expect(screen.queryByTestId('friend-none')).toBeNull();
  });

  it('查詢壞掉跟資料表沒建不是同一件事', async () => {
    const user = userEvent.setup();
    panel({ onLookup: vi.fn(async () => ({ problem: 'error' })) });

    await user.type(screen.getByTestId('friend-email'), 'gina@example.com');
    await user.click(screen.getByTestId('friend-lookup'));

    expect(await screen.findByTestId('friend-error')).toBeTruthy();
    expect(screen.queryByTestId('friend-setup')).toBeNull();
  });
});

describe('邀請與好友', () => {
  it('別人邀請我，可以接受', async () => {
    const user = userEvent.setup();
    const h = panel({ pending: [{ person: GINA, direction: 'incoming' }] });

    expect(screen.getByTestId('friend-pending-u-gina').textContent).toContain('想加你為好友');
    await user.click(screen.getByTestId('friend-accept-u-gina'));

    expect(h.onAccept).toHaveBeenCalledWith(GINA);
  });

  it('我邀請別人，只能等或取消', () => {
    panel({ pending: [{ person: GINA, direction: 'outgoing' }] });

    expect(screen.getByTestId('friend-pending-u-gina').textContent).toContain('等待對方回覆');
    expect(screen.queryByTestId('friend-accept-u-gina')).toBeNull();
    expect(screen.getByTestId('friend-cancel-u-gina')).toBeTruthy();
  });

  it('沒有好友的時候說出來，而不是一片空白', () => {
    panel();
    expect(screen.getByText(/還沒有好友/)).toBeTruthy();
  });

  it('好友列得出來，也移得掉', async () => {
    const user = userEvent.setup();
    const h = panel({ friends: [GINA] });

    expect(screen.getByTestId('friend-u-gina').textContent).toContain('Gina');
    await user.click(screen.getByTestId('friend-remove-u-gina'));

    expect(h.onRemove).toHaveBeenCalledWith(GINA);
  });
});

/**
 * 「然後點擊這個對象，應該要可以看到他跟我一起的旅行」.
 *
 * The row said a name and offered to remove them — the one question nobody
 * opens this screen to answer. What a friend is for here is the trips their
 * name is already on.
 */
describe('一起去過的旅行', () => {
  const shared = [
    { id: 't1', label: '東京 2026 秋', startDate: '2026-10-20', endDate: '2026-10-24' },
    { id: 't0', label: '釜山', startDate: '2026-03-20', endDate: '2026-03-24' },
  ];

  const withTrips = (over: Record<string, unknown> = {}) => panel({
    friends: [GINA],
    tripsWith: () => shared,
    ...over,
  });

  it('says how many without being opened', () => {
    withTrips();

    expect(screen.getByTestId('friend-open-u-gina').textContent).toContain('一起去過 2 趟');
  });

  it('lists them when the name is tapped', async () => {
    const user = userEvent.setup();
    withTrips();

    expect(screen.queryByTestId('friend-trips-u-gina')).toBeNull();
    await user.click(screen.getByTestId('friend-open-u-gina'));

    const list = screen.getByTestId('friend-trips-u-gina');
    expect(list.textContent).toContain('東京 2026 秋');
    expect(list.textContent).toContain('2026/10/20 – 10/24');
  });

  it('opens one', async () => {
    const user = userEvent.setup();
    const onOpenTrip = vi.fn();
    withTrips({ onOpenTrip });

    await user.click(screen.getByTestId('friend-open-u-gina'));
    await user.click(screen.getByTestId('friend-trip-t1'));

    expect(onOpenTrip).toHaveBeenCalledWith('t1');
  });

  it('closes again', async () => {
    const user = userEvent.setup();
    withTrips();

    await user.click(screen.getByTestId('friend-open-u-gina'));
    await user.click(screen.getByTestId('friend-open-u-gina'));

    expect(screen.queryByTestId('friend-trips-u-gina')).toBeNull();
  });

  /*
    A row that expands into 「no trips together」 teaches that tapping names is
    pointless, and that lesson spreads to the rows where it is not.
  */
  it('is not tappable when there are none', () => {
    panel({ friends: [GINA], tripsWith: () => [] });

    expect(screen.queryByTestId('friend-open-u-gina')).toBeNull();
    expect(screen.getByTestId('friend-u-gina').textContent).toContain('Gina');
  });

  /* 移除好友 is still there, and still only itself. */
  it('leaves the remove button alone', async () => {
    const user = userEvent.setup();
    const h = withTrips();

    await user.click(screen.getByTestId('friend-remove-u-gina'));

    expect(h.onRemove).toHaveBeenCalled();
  });
});
