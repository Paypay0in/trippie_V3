/**
 * @vitest-environment jsdom
 *
 * 「若點選我去過的紀錄的話 我希望主要看到的都是自己的紀錄 不是跟看收藏一樣都是網路
 * 搜尋的結果」.
 *
 * A place he is deciding about and a place he has been to are two different
 * screens. Deciding wants Google's record and strangers' reviews at the top;
 * remembering wants his own bill, his own line, his own photographs, and the
 * internet underneath. Same blocks, the other order — nothing is hidden from
 * either reading.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import SavedPlaceCard from '../components/SavedPlaceCard';
import { clearPlacePhotoCache } from '../services/placePhotoService';
import { clearPlaceReviewsCache } from '../services/placeReviewsService';
import { SpendAtPlace } from '../services/spendAtPlace';

beforeEach(() => {
  clearPlacePhotoCache();
  clearPlaceReviewsCache();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('/api/places/reviews')
      ? { reviews: [{ text: '中午要排隊', rating: 5, when: '3 個月前', authorName: '林小姐' }] }
      : { photo: null, photos: [] }),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const place = {
  placeName: '佐藤養助 淺草店',
  placeId: 'ChIJ-sato',
  formattedAddress: '1-chōme-30-12 Asakusa, Taito City, Tokyo',
  city: '東京',
  country: '日本',
};

const bill: SpendAtPlace = {
  expenseId: 'e', date: '2026-10-20', description: '佐藤養助', twdAmount: 946,
  amountOriginal: 4300, currency: 'JPY', exchangeRate: 0.22,
  items: [{ name: '稻庭烏龍麵', quantity: 1, amount: 4300 }],
};

const open = (over: Record<string, unknown> = {}) => render(
  <SavedPlaceCard place={place} notes={[]} onClose={vi.fn()} {...over} />,
);

/** Where a block sits in the rendered document, for comparing two of them. */
const positionOf = (testId: string): number => {
  const node = screen.getByTestId(testId);
  return Array.from(document.querySelectorAll('[data-testid]')).indexOf(node);
};

describe('a place he has been to', () => {
  it('puts his own record above the reviews', async () => {
    open({ spend: [bill], visited: true });

    await waitFor(() => expect(screen.getByTestId('place-reviews')).toBeTruthy());
    expect(positionOf('place-spend-record')).toBeLessThan(positionOf('place-reviews'));
  });

  it('puts his own note above Google 基本資料', async () => {
    open({
      notes: [{ id: 'n', text: '要吃冷的', sourcePostId: '', sourceCreatorId: 'me' }],
      visited: true,
    });

    await waitFor(() => expect(screen.getByTestId('saved-place-notes')).toBeTruthy());
    expect(positionOf('saved-place-notes')).toBeLessThan(positionOf('place-reviews'));
  });

  /*
    A bill recorded here is evidence he went, whether or not anybody ticked
    已訪 — and 已訪 alone is enough when there is nothing else attached.
  */
  it('counts a bill as having been here', async () => {
    open({ spend: [bill] });

    await waitFor(() => expect(screen.getByTestId('place-reviews')).toBeTruthy());
    expect(positionOf('place-spend-record')).toBeLessThan(positionOf('place-reviews'));
  });

  /* Nothing is hidden: a visited place still has opening hours and reviews. */
  it('still shows the reviews underneath', async () => {
    open({ spend: [bill], visited: true });

    await waitFor(() => expect(screen.getByTestId('place-reviews').textContent).toContain('中午要排隊'));
  });

  /* He went. There is nothing left for a search to tell him about it. */
  it('does not offer the AI lookup', async () => {
    open({ spend: [bill], visited: true });

    await waitFor(() => expect(screen.getByTestId('place-reviews')).toBeTruthy());
    expect(screen.queryByTestId('look-up-highlights')).toBeNull();
  });
});

describe('a place he is still deciding about', () => {
  it('leads with Google and the reviews', async () => {
    open();

    await waitFor(() => expect(screen.getByTestId('place-reviews')).toBeTruthy());
    expect(positionOf('place-reviews')).toBeLessThan(positionOf('look-up-highlights'));
  });
});
