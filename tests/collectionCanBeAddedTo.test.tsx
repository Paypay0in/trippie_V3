/**
 * @vitest-environment jsdom
 *
 * 「這裡也要可以手動與讀取截圖來加入旅行靈感」.
 *
 * 手動新增地點 and 從截圖加入 existed on the trip's planning screen and nowhere
 * else — so the collection, the screen whose whole job is holding saved
 * places, had no way to add one. A shelf with the door on another floor.
 *
 * Both are the same components the planner uses rather than second copies:
 * adding a place has one idea of what a Google Maps link means, and reading a
 * screenshot has one idea of what a card is.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SavedTravelDestinationDetail from '../components/SavedTravelDestinationDetail';
import { SavedTravelInspiration } from '../types';

afterEach(cleanup);

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'a', savedByUserId: 'me', placeName: '黑船亭',
  country: '日本', city: '東京', notes: [],
  sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c', sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

const mount = (over: Record<string, unknown> = {}) => {
  const props = Object.assign({
    country: '日本',
    city: '東京',
    items: [saved()],
    communityPosts: [],
    onBack: vi.fn(),
    onRemove: vi.fn(),
    onResolveItem: vi.fn(),
    onOpenCommunityPost: vi.fn(),
    onCreateTrip: vi.fn(),
  }, over) as unknown as React.ComponentProps<typeof SavedTravelDestinationDetail>;
  render(<SavedTravelDestinationDetail {...props} />);
};

describe('the collection screen', () => {
  it('offers 手動新增地點', () => {
    mount({ onAddSavedPlace: vi.fn() });

    expect(screen.getByTestId('open-add-place').textContent).toContain('手動新增地點');
  });

  it('opens the same search box the planner uses', () => {
    mount({ onAddSavedPlace: vi.fn() });

    fireEvent.click(screen.getByTestId('open-add-place'));

    expect((screen.getByTestId('add-place-input') as HTMLInputElement).placeholder)
      .toContain('Google 地圖連結');
  });

  it('offers the screenshot import', () => {
    mount({ onSaveScreenshotPlaces: vi.fn() });

    expect(screen.getByTestId('screenshot-intake')).toBeTruthy();
  });

  /*
    A screen given neither handler shows neither control, rather than a button
    that cannot do anything.
  */
  it('shows neither when the caller wires neither', () => {
    mount();

    expect(screen.queryByTestId('open-add-place')).toBeNull();
    expect(screen.queryByTestId('screenshot-intake')).toBeNull();
  });
});

/**
 * 「能讓收藏清單中看到我在記帳下寫的備註嗎與圖片嗎？」
 *
 * The collection holds what somebody else said about a place; the ledger holds
 * what it cost when you went.
 */
describe('a saved place you have paid at', () => {
  const bill = {
    id: 'e', date: '2026-10-20', description: '黑船亭 洋食料理', twdAmount: 882,
    amount: 4300, currency: 'JPY', exchangeRate: 0.205,
    category: '餐飲', phase: 'during', merchantPlaceId: 'ChIJ-k',
    note: '蘑菇義大利麵很好吃', receiptPhotos: ['photo-1'],
  };

  it('says what it cost, with the note written on the bill', () => {
    mount({ items: [saved({ placeId: 'ChIJ-k' })], expenses: [bill] });

    const block = screen.getByTestId('spend-at-a');
    expect(block.textContent).toContain('NT$ 882');
    expect(block.textContent).toContain('蘑菇義大利麵很好吃');
  });

  /*
    「點擊下去要有小卡片：照片與當初記帳的備註，還有實際的結帳細目！」
  */
  it('opens the bill itself when the row is tapped', () => {
    mount({
      items: [saved({ placeId: 'ChIJ-k' })],
      expenses: [{
        ...bill,
        merchant: 'KUROFUNE-TEI',
        amount: 4300,
        receiptItems: [
          { name: 'ハヤシライス', quantity: 2, amount: 3000 },
          { name: 'コーヒー', amount: 1300 },
        ],
      }],
    });

    expect(screen.queryByTestId('spend-detail-e')).toBeNull();
    fireEvent.click(screen.getByTestId('spend-row-e'));

    const card = screen.getByTestId('spend-detail-e');
    expect(card.textContent).toContain('ハヤシライス');
    expect(card.textContent).toContain('×2');
    expect(card.textContent).toContain('コーヒー');
    expect(card.textContent).toContain('蘑菇義大利麵很好吃');
    expect(card.querySelectorAll('img').length).toBe(1);
  });

  /* A receipt with no lines says so, rather than showing an empty table. */
  it('says when there were no printed lines', () => {
    mount({ items: [saved({ placeId: 'ChIJ-k' })], expenses: [bill] });
    fireEvent.click(screen.getByTestId('spend-row-e'));

    expect(screen.getByTestId('spend-detail-e').textContent).toContain('沒有留下結帳細目');
  });

  it('shows nothing for a place no bill was recorded at', () => {
    mount({ items: [saved({ placeId: 'ChIJ-other' })], expenses: [bill] });

    expect(screen.queryByTestId('spend-at-a')).toBeNull();
  });
});

/**
 * 「沒有喔」 — the restaurant was in the collection, the receipt was in the
 * ledger, and nothing joined them, because the printed address resolved to
 * nothing and so the scan recorded no `merchantPlaceId`.
 */
describe('linking a bill to a place by hand', () => {
  const unplaced = {
    id: 'e', date: '2026-10-20', description: '黑船亭 洋食料理', twdAmount: 882,
    amount: 4300, currency: 'JPY', exchangeRate: 0.205,
    category: '餐飲', phase: 'during',
    merchantAddress: '東京都台東区上野2-13-13',
  };

  const openMenu = () => fireEvent.click(screen.getByLabelText('Kurofunetei 更多選項'));

  it('offers the link when a bill has no place of its own', () => {
    mount({
      items: [saved({ placeName: 'Kurofunetei', placeId: 'ChIJ-k' })],
      expenses: [unplaced],
      onLinkExpense: vi.fn(),
    });
    openMenu();

    expect(screen.getByTestId('link-expense-a')).toBeTruthy();
  });

  it('hands back the bill and the place', () => {
    const onLinkExpense = vi.fn();
    mount({
      items: [saved({ placeName: 'Kurofunetei', placeId: 'ChIJ-k' })],
      expenses: [unplaced],
      onLinkExpense,
    });
    openMenu();
    fireEvent.click(screen.getByTestId('link-expense-a'));
    fireEvent.click(screen.getByTestId('link-expense-pick-e'));

    expect(onLinkExpense).toHaveBeenCalledWith('e', expect.objectContaining({ placeId: 'ChIJ-k' }));
  });

  /*
    A bill that already resolved is already somewhere; offering to move it
    would be a different feature with a different risk.
  */
  it('does not offer a bill that already has a place', () => {
    mount({
      items: [saved({ placeName: 'Kurofunetei', placeId: 'ChIJ-k' })],
      expenses: [{ ...unplaced, merchantPlaceId: 'ChIJ-somewhere' }],
      onLinkExpense: vi.fn(),
    });
    openMenu();

    expect(screen.queryByTestId('link-expense-a')).toBeNull();
  });
});
