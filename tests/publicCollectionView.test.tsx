/**
 * @vitest-environment jsdom
 *
 * Somebody else's collection, seen by whoever opened the link.
 *
 * The visitor's half of 收藏集頁面 and 別人儲存整份收藏 together, because
 * 「save all」 and 「pick a few」 are the same action with a different
 * selection — splitting them is how one ends up keeping provenance the other
 * drops.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen } from '@testing-library/react';
import PublicCollectionView from '../components/PublicCollectionView';
import { PublicCollection } from '../services/savedCollectionSync';
import { SavedCollectionItem, SavedTravelInspiration } from '../types';

const item = (id: string, patch: Partial<SavedCollectionItem> = {}): SavedCollectionItem => ({
  id, collectionId: 'c1', position: 0, placeName: `Place ${id}`, placeId: `g-${id}`,
  country: '日本', city: '東京', notes: [], ...patch,
});

const collection: PublicCollection = {
  id: 'c1', ownerId: 'ann', title: '東京咖啡地圖',
  description: '在東京找了很多間咖啡廳', country: '日本', city: '東京',
  items: [item('a'), item('b'), item('c')],
};

const view = (props: Partial<React.ComponentProps<typeof PublicCollectionView>> = {}) => {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onSignIn: vi.fn() };
  render(
    <PublicCollectionView
      collection={collection}
      held={[]}
      signedIn
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

afterEach(cleanup);

describe('打開別人的收藏連結', () => {
  it('shows the list and what it is', () => {
    view();

    expect(screen.getByText('東京咖啡地圖')).toBeTruthy();
    expect(screen.getByText('在東京找了很多間咖啡廳')).toBeTruthy();
    expect(screen.getByTestId('public-collection-item-a')).toBeTruthy();
  });

  /*
    One sentence for every refusal. Private, unpublished, revoked and
    wrongly-tokened all land here, because 「you may not see this」 tells a
    stranger that something is there.
  */
  it('says the same thing for every reason it cannot be read', () => {
    view({ collection: undefined, notFound: true });

    const missing = screen.getByTestId('public-collection-missing');
    expect(missing.textContent).toContain('找不到這份收藏');
    expect(missing.textContent).toContain('已經取消公開');
  });
});

describe('收藏進自己的清單', () => {
  it('saves the whole thing', async () => {
    const { onSave } = view();

    await userEvent.click(screen.getByTestId('public-collection-save-all'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(3);
    expect(screen.getByTestId('public-collection-saved')).toBeTruthy();
  });

  it('saves only what was picked', async () => {
    const { onSave } = view();

    await userEvent.click(screen.getByTestId('public-collection-pick'));
    await userEvent.click(screen.getByTestId('public-collection-item-a'));
    await userEvent.click(screen.getByTestId('public-collection-item-c'));
    await userEvent.click(screen.getByTestId('public-collection-save-all'));

    expect(onSave.mock.calls[0][0].map((entry: SavedCollectionItem) => entry.id)).toEqual(['a', 'c']);
  });

  it('will not save an empty selection', async () => {
    const { onSave } = view();

    await userEvent.click(screen.getByTestId('public-collection-pick'));
    expect(screen.getByTestId('public-collection-save-all')).toHaveProperty('disabled', true);
    expect(onSave).not.toHaveBeenCalled();
  });

  /* 「已收藏」, so saving twice does not look like the only thing on offer. */
  it('marks a place this traveller already holds', () => {
    const mine: SavedTravelInspiration = {
      id: 'h1', savedByUserId: 'me', country: '日本', city: '東京',
      placeName: 'Place b', placeId: 'g-b', sourcePostId: 'manual:x',
      sourceSliceId: 'manual:x', sourceCreatorId: 'me', sourceNoteIds: [],
      savedAt: '2026-10-01T00:00:00.000Z', notes: [],
    };
    view({ held: [mine] });

    expect(screen.getByTestId('public-collection-held-b')).toBeTruthy();
    expect(screen.queryByTestId('public-collection-held-a')).toBeNull();
  });
});

describe('還沒登入的人', () => {
  /* A save has to belong to somebody, and that is said before anything is tapped. */
  it('can read it, and is told why they cannot save yet', async () => {
    const { onSignIn, onSave } = view({ signedIn: false });

    expect(screen.getByText('東京咖啡地圖')).toBeTruthy();
    expect(screen.queryByTestId('public-collection-save-all')).toBeNull();

    await userEvent.click(screen.getByTestId('public-collection-sign-in'));
    expect(onSignIn).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
