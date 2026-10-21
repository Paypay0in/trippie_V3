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
  /*
    「在地圖上查看是重複資訊」 — 在 Google 地圖開啟 sits directly beneath it and
    goes to the same place. Two buttons to one destination is a decision made
    out of something that has no choice in it.
  */
  it('is not also a link, because the button below already is', () => {
    open();

    expect(screen.queryByTestId('saved-place-address-link')).toBeNull();
    expect(screen.getByTestId('saved-place-maps-link')).toBeTruthy();
  });
});

/**
 * 「下面不是我的備註，是我從旅人筆記的資訊，我覺得要區分」.
 *
 * Every note carries the id of whoever wrote it, and the card was calling all
 * of them 我的備註 — which attributes another traveller's observation to the
 * reader.
 */
describe('the notes', () => {
  const byMe = { id: 'mine', text: '蘑菇義大利麵超好吃！', sourcePostId: '', sourceCreatorId: 'me' };
  const saved = { id: 'theirs', text: '低調的二樓小樓，一樓販售可可製品', sourcePostId: 'q', sourceCreatorId: 'me' };

  /*
    「這是我收藏的其他人的旅行筆記 不是我寫的備註」. The creator id on a saved
    note is the person who saved it as often as the person who wrote it — the
    collection screen resolves authorship from `sourcePostId` for exactly that
    reason — so comparing it against the reader put Ann's sentence under 我的
    備註.
  */
  it('keeps a note that came from a post under 旅人筆記, whoever saved it', () => {
    open({ notes: [saved], viewerUserId: 'me' });

    expect(screen.getByTestId('saved-place-traveller-notes').textContent).toContain('旅人筆記');
    expect(screen.queryByTestId('saved-place-notes')).toBeNull();
  });

  it('calls an unsourced note the reader\'s own', () => {
    open({ notes: [byMe], viewerUserId: 'me' });

    expect(screen.getByTestId('saved-place-notes').textContent).toContain('我的備註');
    expect(screen.queryByTestId('saved-place-traveller-notes')).toBeNull();
  });

  it('splits them when there is one of each', () => {
    open({ notes: [byMe, saved], viewerUserId: 'me' });

    expect(screen.getByTestId('saved-place-notes').textContent).toContain('蘑菇義大利麵超好吃！');
    expect(screen.getByTestId('saved-place-traveller-notes').textContent).toContain('低調的二樓小樓');
  });

  /* The split does not depend on knowing who is reading. */
  it('splits the same way with no viewer', () => {
    open({ notes: [byMe, saved] });

    expect(screen.getByTestId('saved-place-notes').textContent).toContain('蘑菇義大利麵超好吃！');
    expect(screen.getByTestId('saved-place-traveller-notes').textContent).toContain('低調的二樓小樓');
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

  /*
    「點擊下去沒有看到我在記帳的帳目中寫的備註」. A block that only appears when
    it has something in it cannot be told apart from one that lost it.
  */
  it('shows the note written on the bill', () => {
    open({ spend: [bill({ note: '蘑菇義大利麵超好吃！' })] });

    expect(screen.getByTestId('place-spend-note-e').textContent).toContain('蘑菇義大利麵超好吃！');
  });

  it('says so when the bill carries no note', () => {
    open({ spend: [bill()] });

    expect(screen.getByTestId('place-spend-note-e').textContent).toContain('沒有寫備註');
  });

  /* A receipt with no lines says so, rather than showing an empty table. */
  it('says when the receipt left no lines', () => {
    open({ spend: [bill({ items: undefined })] });

    expect(screen.getByTestId('place-spend-record').textContent).toContain('沒有留下結帳細目');
  });
});
