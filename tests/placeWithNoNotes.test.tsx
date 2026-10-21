/**
 * @vitest-environment jsdom
 *
 * 「像收藏了這間店 但沒有相關旅行筆記 可以讓AI爬文看這間店有名的是什麼嗎？」
 *
 * A place saved from a map link arrives with an address, a rating and a
 * category, and nothing a person would actually tell you about it. The lookup
 * goes where those notes would have gone — which is also why it is labelled as
 * the machine's work and shows what it read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SavedPlaceCard from '../components/SavedPlaceCard';
import { clearPlacePhotoCache } from '../services/placePhotoService';
import { clearPlaceHighlightsCache } from '../services/placeHighlightsService';

const highlights = vi.fn(async () => ({
  points: ['稻庭烏龍麵的老舖，細麵手打，淺草店在雷門附近'],
  sources: [{ title: '佐藤養助 官方網站', url: 'https://sato-yoske.co.jp' }],
}));

beforeEach(() => {
  clearPlacePhotoCache();
  clearPlaceHighlightsCache();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('/api/places/highlights')
      ? await highlights()
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

const note = { id: 'n', text: '低調的二樓小樓', sourcePostId: 'q', sourceCreatorId: 'ann' };

describe('a saved place nobody wrote about', () => {
  /* A search per place, so it costs nothing until somebody asks. */
  it('offers the lookup without running it', () => {
    open();

    expect(screen.getByTestId('look-up-highlights')).toBeTruthy();
    expect(screen.queryByTestId('place-highlights')).toBeNull();
    expect(highlights).not.toHaveBeenCalled();
  });

  it('shows what it found, and what it read', async () => {
    open();

    fireEvent.click(screen.getByTestId('look-up-highlights'));

    await waitFor(() => expect(screen.getByTestId('place-highlights')).toBeTruthy());
    const block = screen.getByTestId('place-highlights');
    expect(block.textContent).toContain('稻庭烏龍麵');
    expect(block.textContent).toContain('AI 查到的重點');
    expect(block.querySelector('a')?.getAttribute('href')).toBe('https://sato-yoske.co.jp');
  });

  /*
    The server refuses to answer from memory, so an answer with no sources is
    treated as nothing found — a fact about the place, said plainly.
  */
  it('says so when the search found nothing', async () => {
    highlights.mockResolvedValueOnce({ points: ['很好吃'], sources: [] });
    open();

    fireEvent.click(screen.getByTestId('look-up-highlights'));

    await waitFor(() => expect(screen.getByTestId('place-highlights-empty')).toBeTruthy());
    expect(screen.getByTestId('place-highlights').textContent).not.toContain('很好吃');
  });
});

/*
  Somebody's own account of a restaurant beats a search every time, and running
  both would put a machine's summary beside a person's experience as though the
  two were the same kind of thing.
*/
describe('a saved place somebody wrote about', () => {
  it('does not offer the lookup', () => {
    open({ notes: [note] });

    expect(screen.queryByTestId('look-up-highlights')).toBeNull();
    expect(screen.getByTestId('saved-place-traveller-notes')).toBeTruthy();
  });
});
