/**
 * @vitest-environment jsdom
 *
 * 「沒辦法觸發Google map上的評論 或是 小紅書上的內容嗎」.
 *
 * The grounded lookup came back empty for 佐藤養助 淺草店 — a chain with a
 * century behind it — which is the honest failure mode of a search that
 * refuses to answer from memory. The map's own reviews do not have that
 * problem: first-party, attributed, written by people who went.
 *
 * Quoted rather than summarised. A summary of five reviews is a sentence
 * nobody said.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import SavedPlaceCard from '../components/SavedPlaceCard';
import { clearPlacePhotoCache } from '../services/placePhotoService';
import { clearPlaceReviewsCache } from '../services/placeReviewsService';

const REVIEWS = [
  { text: '稻庭烏龍麵真的細，湯頭清爽，中午要排隊', rating: 5, when: '3 個月前', authorName: '林小姐' },
  { text: '二樓有座位，比本店好等', rating: 4, when: '1 年前', authorName: 'Kenji' },
];

const reviewsFor = vi.fn(async () => REVIEWS);

beforeEach(() => {
  clearPlacePhotoCache();
  clearPlaceReviewsCache();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('/api/places/reviews')
      ? { reviews: await reviewsFor() }
      : { photo: null, photos: [] }),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const place = {
  placeName: '佐藤養助 淺草店',
  placeId: 'ChIJ-sato',
  formattedAddress: '1-chōme-30-12 Asakusa, Taito City, Tokyo',
  city: '東京',
  country: '日本',
};

const open = (over: Record<string, unknown> = {}) => render(
  <SavedPlaceCard place={place} notes={[]} onClose={vi.fn()} {...over} />,
);

describe('Google 評論', () => {
  it('quotes them whole, with who wrote them', async () => {
    open();

    await waitFor(() => expect(screen.getByTestId('place-reviews')).toBeTruthy());
    const block = screen.getByTestId('place-reviews');
    expect(block.textContent).toContain('稻庭烏龍麵真的細');
    expect(block.textContent).toContain('林小姐');
    expect(block.textContent).toContain('★ 5');
    expect(block.textContent).toContain('3 個月前');
  });

  /*
    A traveller's note and a stranger's review answer different questions, so
    one does not replace the other.
  */
  it('shows them alongside a traveller note', async () => {
    open({ notes: [{ id: 'n', text: '低調的二樓小樓', sourcePostId: 'q', sourceCreatorId: 'ann' }] });

    await waitFor(() => expect(screen.getByTestId('place-reviews')).toBeTruthy());
    expect(screen.getByTestId('saved-place-traveller-notes')).toBeTruthy();
  });

  it('shows nothing when the place has no reviews', async () => {
    reviewsFor.mockResolvedValueOnce([]);
    open();

    await waitFor(() => expect(screen.getByTestId('look-up-highlights')).toBeTruthy());
    expect(screen.queryByTestId('place-reviews')).toBeNull();
  });
});
