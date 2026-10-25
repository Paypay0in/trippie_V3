/**
 * @vitest-environment jsdom
 *
 * 我的收藏集 — the named lists, and one of them opened.
 *
 * A collection is not a bucket the app computed. Saved places are already
 * grouped by country and city elsewhere, and that key is a trimmed string:
 * rename a city and the group is a different group. These are lists somebody
 * named, which is why they are worth sharing and why they have ids.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import SavedCollectionsPanel from '../components/SavedCollectionsPanel';
import { newCollection, publishCollection } from '../services/collectionLifecycle';
import { SavedTravelInspiration } from '../types';

const ME = 'me';
const at = () => '2026-10-24T00:00:00.000Z';

const place = (id: string, patch: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id, savedByUserId: ME, country: '日本', city: '東京', district: '中目黑',
  placeName: `Place ${id}`, sourcePostId: `manual:${id}`, sourceSliceId: `manual:${id}`,
  sourceCreatorId: ME, sourceNoteIds: [], savedAt: at(), notes: [], ...patch,
});

const coffee = newCollection({ title: '東京咖啡地圖', country: '日本', city: '東京' }, ME, () => 'c1', at);
const food = publishCollection(
  newCollection({ title: '大阪美食口袋名單', city: '大阪' }, ME, () => 'c2', at),
  'public', at, () => 'tok',
);

const panel = (props: Partial<React.ComponentProps<typeof SavedCollectionsPanel>> = {}) => {
  const handlers = {
    onCreate: vi.fn(), onPublish: vi.fn(), onUnpublish: vi.fn(),
    onOpenPlace: vi.fn(), onChangeMembership: vi.fn(),
  };
  render(
    <SavedCollectionsPanel
      collections={[coffee, food]}
      places={[place('p1', { category: 'cafe' }), place('p2', { category: 'cafe' }), place('p3', { category: 'food' })]}
      membership={{ c1: ['p1', 'p2', 'p3'], c2: [] }}
      origin="https://trippie"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('收藏集列表', () => {
  it('names each list, how many places, and who can see it', () => {
    panel();

    const row = screen.getByTestId('collection-row-c1');
    expect(within(row).getByText('東京咖啡地圖')).toBeTruthy();
    expect(row.textContent).toContain('3 個地點');
    expect(row.textContent).toContain('私人');

    expect(screen.getByTestId('collection-row-c2').textContent).toContain('公開');
  });

  /* Private until published, and said before anything is created. */
  it('says a new one is private before it is made', async () => {
    const { onCreate } = panel();

    await userEvent.click(screen.getByTestId('collection-add'));
    expect(screen.getByTestId('collection-add-form').textContent)
      .toContain('建立後只有你看得到');

    await userEvent.type(screen.getByLabelText('收藏集名稱'), '京都寺廟');
    await userEvent.click(screen.getByText('建立'));
    expect(onCreate).toHaveBeenCalledWith('京都寺廟');
  });

  it('refuses to create one with no name', async () => {
    const { onCreate } = panel();

    await userEvent.click(screen.getByTestId('collection-add'));
    await userEvent.click(screen.getByText('建立'));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('says so when there are none at all', () => {
    panel({ collections: [], membership: {} });
    expect(screen.getByTestId('collection-list').textContent).toContain('還沒有收藏集');
  });
});

describe('一個收藏集打開之後', () => {
  const openCoffee = async () => {
    panel();
    await userEvent.click(screen.getByTestId('collection-row-c1'));
  };

  it('lists its places and counts the tags', async () => {
    await openCoffee();
    const detail = screen.getByTestId('collection-detail');

    expect(within(detail).getByText('東京咖啡地圖')).toBeTruthy();
    /* 「咖啡」, from `placeCategory`, which is the one place that names tags. */
    expect(detail.textContent).toContain('咖啡 2');
    expect(detail.textContent).toContain('餐廳 1');
    expect(screen.getByTestId('collection-place-p1')).toBeTruthy();
  });

  it('opens a place when one is tapped', async () => {
    const onOpenPlace = vi.fn();
    panel({ onOpenPlace });
    await userEvent.click(screen.getByTestId('collection-row-c1'));
    await userEvent.click(screen.getByTestId('collection-place-p2'));

    expect(onOpenPlace).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
  });

  /* One component, so there is one place deciding what 公開 means. */
  it('goes to the share sheet with that collection’s places', async () => {
    await openCoffee();
    await userEvent.click(screen.getByTestId('collection-open-share'));

    expect(screen.getByTestId('collection-share-sheet').textContent)
      .toContain('東京咖啡地圖・3 個地點');
  });

  it('says so when a collection is empty', async () => {
    panel();
    await userEvent.click(screen.getByTestId('collection-row-c2'));

    expect(screen.getByTestId('collection-detail').textContent).toContain('還沒有地點');
  });
});

/**
 * The action the whole feature was waiting on.
 *
 * A collection with nothing in it cannot be previewed, published or saved
 * from, so every screen downstream was running on an empty list until there
 * was a way to fill one.
 */
describe('把地點加進收藏集', () => {
  const open = async (props: Partial<React.ComponentProps<typeof SavedCollectionsPanel>> = {}) => {
    const handlers = panel({ membership: { c1: ['p1'], c2: [] }, ...props });
    await userEvent.click(screen.getByTestId('collection-row-c1'));
    await userEvent.click(screen.getByTestId('collection-add-places'));
    return handlers;
  };

  it('lists every saved place, ticking the ones already in', async () => {
    await open();

    expect(screen.getByTestId('collection-picker')).toBeTruthy();
    expect(screen.getByTestId('collection-pick-p1')).toBeTruthy();
    expect(screen.getByTestId('collection-pick-p3')).toBeTruthy();
  });

  it('puts one in', async () => {
    const { onChangeMembership } = await open();

    await userEvent.click(screen.getByTestId('collection-pick-p2'));
    expect(onChangeMembership).toHaveBeenCalledWith('c1', ['p1', 'p2']);
  });

  /* Taking one out is the same gesture as putting it in. */
  it('takes one out', async () => {
    const { onChangeMembership } = await open();

    await userEvent.click(screen.getByTestId('collection-pick-p1'));
    expect(onChangeMembership).toHaveBeenCalledWith('c1', []);
  });

  it('narrows by what was typed', async () => {
    await open();

    await userEvent.type(screen.getByLabelText('搜尋你收藏的地點'), 'p2');
    expect(screen.queryByTestId('collection-pick-p1')).toBeNull();
    expect(screen.getByTestId('collection-pick-p2')).toBeTruthy();
  });

  it('says when a search matches nothing', async () => {
    await open();

    await userEvent.type(screen.getByLabelText('搜尋你收藏的地點'), '京都');
    expect(screen.getByTestId('collection-picker').textContent).toContain('找不到符合的收藏地點');
  });

  it('says when there is nothing saved at all', async () => {
    await open({ places: [] });
    expect(screen.getByTestId('collection-picker').textContent).toContain('還沒有收藏任何地點');
  });

  /* A panel with no way to change membership does not offer to. */
  it('offers nothing when it cannot save', async () => {
    panel({ onChangeMembership: undefined });
    await userEvent.click(screen.getByTestId('collection-row-c1'));

    expect(screen.queryByTestId('collection-add-places')).toBeNull();
  });
});
