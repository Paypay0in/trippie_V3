/**
 * @vitest-environment jsdom
 *
 * 「這邊加一個可以上傳截圖的區塊。讓他讀取截圖中的旅行資訊，切片之後讓用戶可以加入
 * 行程」.
 *
 * The parser is unit-tested next to the service. This is the part that decides
 * whether the feature is safe: a picture read wrongly that silently became six
 * itinerary cards would be worse than no feature at all. Nothing is written
 * until the traveller ticks it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ScreenshotItineraryIntake from '../components/ScreenshotItineraryIntake';

const DATES = ['2026-10-02', '2026-10-03', '2026-10-04'];

const slices = {
  slices: [
    { type: 'food', title: '大師兄牛肉麵', notes: [{ text: '晚上七點後要排隊' }] },
    { type: 'place', title: '甘川洞文化村', suggestedStartTime: '10:00', notes: [] },
  ],
};

const respondWith = (body: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => body } as unknown as Response));

const upload = async (user: ReturnType<typeof userEvent.setup>) => {
  const file = new File(['x'], 'shot.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('上傳旅行截圖'), file);
};

const panel = (onAddItems = vi.fn(), onSaveToCollection?: ReturnType<typeof vi.fn>) => {
  render(
    <ScreenshotItineraryIntake
      dates={DATES}
      defaultDate={DATES[0]}
      destination="釜山"
      onAddItems={onAddItems}
      onSaveToCollection={onSaveToCollection}
    />,
  );
  return onAddItems;
};

beforeEach(() => {
  // jsdom has no FileReader result for our fake file unless we drive it.
  vi.stubGlobal('FileReader', class {
    result = 'data:image/png;base64,AAAA';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() { setTimeout(() => this.onload?.(), 0); }
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('上傳截圖之後', () => {
  it('把讀到的項目一條一條列出來給人看', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    panel();

    await upload(user);

    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    expect(screen.getByText('甘川洞文化村')).toBeTruthy();
    // The bullet is its own element now, so the note is just its text.
    expect(screen.getByText('晚上七點後要排隊')).toBeTruthy();
  });

  it('在使用者按下去之前，什麼都不會寫進行程', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    const onAddItems = panel();

    await upload(user);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());

    expect(onAddItems).not.toHaveBeenCalled();
  });

  it('按下加入時，只加勾選的那些', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    const onAddItems = panel();

    await upload(user);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    // Everything starts ticked; untick the second one.
    await user.click(screen.getByText('甘川洞文化村'));
    await user.click(screen.getByText(/直接加到這一天（1）/));

    expect(onAddItems).toHaveBeenCalledTimes(1);
    const added = onAddItems.mock.calls[0][0];
    expect(added).toHaveLength(1);
    expect(added[0].title).toBe('大師兄牛肉麵');
    expect(added[0].date).toBe('2026-10-02');
  });

  it('可以選擇先不指定日期', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    const onAddItems = panel();

    await upload(user);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    await user.selectOptions(screen.getByLabelText('加入哪一天'), '');
    // With no day chosen the button says so rather than 「這一天」.
    await user.click(screen.getByText(/直接加到行程（2）/));

    expect(onAddItems.mock.calls[0][0][0].date).toBeUndefined();
  });

  it('加完之後說出加了幾個，清單收起來', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    panel();

    await upload(user);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    await user.click(screen.getByText(/直接加到這一天（2）/));

    expect(screen.getByText(/已加入 2 個行程/)).toBeTruthy();
    expect(screen.queryByText('大師兄牛肉麵')).toBeNull();
  });
});

describe('讀不出來的時候', () => {
  it('把伺服器的說法原話顯示出來，而不是蓋成一句通用錯誤', async () => {
    vi.stubGlobal('fetch', respondWith({ error: '這張截圖看不出可以排進行程的地點，換一張再試試。' }, false, 422));
    const user = userEvent.setup();
    const onAddItems = panel();

    await upload(user);

    await waitFor(() => expect(screen.getByText('這張截圖看不出可以排進行程的地點，換一張再試試。')).toBeTruthy());
    expect(onAddItems).not.toHaveBeenCalled();
  });
});

/**
 * 「我感覺這個截圖上傳可以變成一個收藏的 list 最後一鍵讓 AI 閱讀目前行程後 再根據
 *   收藏行程的地址去安排行程表排進去」.
 *
 * A place a friend sent you is not an appointment. Forcing it onto a day as it
 * arrives is the step that makes collecting feel like planning — so the same
 * slices can go into the trip's collection instead, where 補充行程 picks them up
 * and fits them around the flights already on the itinerary.
 */
describe('收藏起來，之後再讓 AI 排', () => {
  it('收藏按鈕把選到的地點交出去，而不是寫進某一天', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const onSaveToCollection = vi.fn(async () => 2);
    const user = userEvent.setup();
    const onAddItems = panel(vi.fn(), onSaveToCollection);

    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('上傳旅行截圖'), file);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    await user.click(screen.getByText(/收藏 2 個，稍後讓 AI 排/));

    await waitFor(() => expect(onSaveToCollection).toHaveBeenCalledTimes(1));
    expect(onSaveToCollection.mock.calls[0][0].map((entry: { title: string }) => entry.title))
      .toEqual(['大師兄牛肉麵', '甘川洞文化村']);
    expect(onAddItems).not.toHaveBeenCalled();
  });

  it('收藏完之後告訴他下一步在哪裡', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    panel(vi.fn(), vi.fn(async () => 2));

    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('上傳旅行截圖'), file);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    await user.click(screen.getByText(/收藏 2 個，稍後讓 AI 排/));

    await waitFor(() => expect(screen.getByTestId('screenshot-saved-note')).toBeTruthy());
    expect(screen.getByTestId('screenshot-saved-note').textContent).toContain('補充行程');
  });

  it('沒有提供收藏功能時，只出現直接加入', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    panel();

    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('上傳旅行截圖'), file);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());

    expect(screen.queryByText(/收藏 2 個/)).toBeNull();
  });
});

/**
 * 「另外上傳截圖目前只能一次一張 希望變10張」.
 *
 * A friend's recommendations arrive as a run of screenshots, and uploading them
 * one at a time means waiting out the parse ten times over.
 */
describe('一次傳很多張', () => {
  const files = (count: number) =>
    Array.from({ length: count }, (_, index) => new File(['x'], `shot-${index}.png`, { type: 'image/png' }));

  it('選幾張就讀幾張', async () => {
    const fetchMock = respondWith(slices);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    panel();

    await user.upload(screen.getByLabelText('上傳旅行截圖'), files(3));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it('跨張重複的地點只留一個', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    panel();

    await user.upload(screen.getByLabelText('上傳旅行截圖'), files(3));

    // Three identical screenshots, two places — not six.
    await waitFor(() => expect(screen.getByText(/讀到 2 個/)).toBeTruthy());
  });

  it('一張讀不出來不會把其他張一起丟掉', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      return call === 1
        ? { ok: false, status: 422, json: async () => ({ error: '這張看不出地點' }) } as unknown as Response
        : { ok: true, status: 200, json: async () => slices } as unknown as Response;
    }));
    const user = userEvent.setup();
    panel();

    await user.upload(screen.getByLabelText('上傳旅行截圖'), files(2));

    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    expect(screen.getByText(/有 1 張沒讀出東西/)).toBeTruthy();
  });

  it('超過十張時處理前十張並說出來', async () => {
    const fetchMock = respondWith(slices);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    panel();

    await user.upload(screen.getByLabelText('上傳旅行截圖'), files(12));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    // The subtitle states the limit too, so match the message that reports it.
    expect(screen.getByText(/已處理前 10 張/)).toBeTruthy();
  });
});
