/**
 * @vitest-environment jsdom
 *
 * 「我預期點擊下去應該是這樣 請100%還原」.
 *
 * The card that opens a saved place had the facts and none of the picture: no
 * photos, a notes block labelled 重點 that never said whose, and no sign
 * anywhere of what the visit cost. All three were already recorded — Google's
 * Details call has always returned every photo and the server threw all but
 * one away, and the receipt's lines have sat in `receiptItems` since the scan.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SavedPlaceCard from '../components/SavedPlaceCard';
import { clearPlacePhotoCache } from '../services/placePhotoService';
import { SpendAtPlace } from '../services/spendAtPlace';

const PHOTOS = [
  { imageUrl: 'pasta' }, { imageUrl: 'room' }, { imageUrl: 'steak' },
  { imageUrl: 'pudding' }, { imageUrl: 'fifth' }, { imageUrl: 'sixth' },
];

beforeEach(() => {
  clearPlacePhotoCache();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('/api/places/photo')
      ? { photo: PHOTOS[0], photos: PHOTOS }
      : {}),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const place = {
  placeName: 'Kurofunetei 黑船亭',
  placeId: 'ChIJ-k',
  formattedAddress: '東京都台東区上野2-13-13',
  coordinates: { latitude: 35.7108, longitude: 139.7753 },
  city: '東京',
  country: '日本',
};

const bill = (over: Partial<SpendAtPlace> = {}): SpendAtPlace => ({
  expenseId: 'e', date: '2026-10-20', description: '黑船亭 洋食料理',
  twdAmount: 946, amountOriginal: 4300, currency: 'JPY', exchangeRate: 0.22,
  merchant: 'KUROFUNE-TEI',
  items: [
    { name: '蘑菇義大利麵', quantity: 1, amount: 2300 },
    { name: '海鮮咖哩', quantity: 1, amount: 2000 },
  ],
  ...over,
});

const open = (over: Record<string, unknown> = {}) => render(
  <SavedPlaceCard place={place} notes={[]} onClose={vi.fn()} {...over} />,
);

describe('the photos', () => {
  it('shows the gallery with how many there are', async () => {
    open();

    await waitFor(() => expect(screen.getByTestId('place-gallery')).toBeTruthy());
    expect(screen.getByTestId('place-gallery-count').textContent).toBe('1 / 6');
    expect(screen.getByTestId('place-gallery-main').getAttribute('src')).toBe('pasta');
  });

  it('changes the big picture when a thumbnail is pressed', async () => {
    open();

    await waitFor(() => expect(screen.getByTestId('place-gallery')).toBeTruthy());
    fireEvent.click(screen.getByTestId('place-gallery-thumb-2'));

    expect(screen.getByTestId('place-gallery-main').getAttribute('src')).toBe('steak');
    expect(screen.getByTestId('place-gallery-count').textContent).toBe('3 / 6');
  });

  /* The overflow is a way into the photos it hides, not a label. */
  it('opens the fifth photo from the +2', async () => {
    open();

    await waitFor(() => expect(screen.getByTestId('place-gallery')).toBeTruthy());
    expect(screen.getByTestId('place-gallery-more').textContent).toContain('+2');
    fireEvent.click(screen.getByTestId('place-gallery-more'));

    expect(screen.getByTestId('place-gallery-count').textContent).toBe('5 / 6');
  });
});

describe('the address', () => {
  it('is itself a way to the map', () => {
    open();

    expect(screen.getByTestId('saved-place-address-link').getAttribute('href')).toContain('google');
  });
});

describe('the notes', () => {
  /*
    Labelled by whose they are: the block above is explicitly Google's, and
    「重點」 did not say who wrote these.
  */
  it('says they are yours', () => {
    open({ notes: [{ id: 'n', text: '蘑菇義大利麵超好吃！', sourcePostId: 'p', sourceCreatorId: 'c' }] });

    const block = screen.getByTestId('saved-place-notes');
    expect(block.textContent).toContain('我的備註');
    expect(block.textContent).toContain('蘑菇義大利麵超好吃！');
  });
});

describe('當天消費紀錄', () => {
  it('lists what was ordered, in both monies', () => {
    open({ spend: [bill()] });

    const block = screen.getByTestId('place-spend-record');
    expect(block.textContent).toContain('當天消費紀錄');
    expect(block.textContent).toContain('蘑菇義大利麵');
    expect(block.textContent).toContain('¥2,300');
    expect(block.textContent).toContain('約 NT$ 506');
    expect(block.textContent).toContain('海鮮咖哩');
  });

  /*
    The total is the bill's own amount, never the printed lines added up: a
    receipt routinely omits service and tax from its lines, so a derived total
    would disagree with what was actually paid.
  */
  it('totals what was paid and says the rate it used', () => {
    open({ spend: [bill()] });

    const block = screen.getByTestId('place-spend-record');
    expect(block.textContent).toContain('¥4,300');
    expect(block.textContent).toContain('約 NT$ 946');
    expect(screen.getByTestId('place-spend-rate').textContent).toContain('¥1 = NT$ 0.22');
  });

  /* A visit is a day. Two visits are not one bigger visit. */
  it('shows one day at a time when there was more than one', () => {
    open({ spend: [bill(), bill({ expenseId: 'old', date: '2026-03-02', twdAmount: 500, amountOriginal: 2300, items: [{ name: 'ハンバーグ', amount: 2300 }] })] });

    expect(screen.queryByText('ハンバーグ')).toBeNull();
    fireEvent.change(screen.getByTestId('place-spend-day'), { target: { value: '2026-03-02' } });
    expect(screen.getByText('ハンバーグ')).toBeTruthy();
  });

  it('is absent for a place nothing was spent at', () => {
    open();

    expect(screen.queryByTestId('place-spend-record')).toBeNull();
  });

  /* A receipt with no lines says so, rather than showing an empty table. */
  it('says when the receipt left no lines', () => {
    open({ spend: [bill({ items: undefined })] });

    expect(screen.getByTestId('place-spend-record').textContent).toContain('沒有留下結帳細目');
  });
});
