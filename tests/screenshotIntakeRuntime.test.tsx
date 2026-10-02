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

const panel = (onAddItems = vi.fn()) => {
  render(<ScreenshotItineraryIntake dates={DATES} defaultDate={DATES[0]} destination="釜山" onAddItems={onAddItems} />);
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
    expect(screen.getByText('・晚上七點後要排隊')).toBeTruthy();
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
    await user.click(screen.getByText(/加入 1 個到行程/));

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
    await user.click(screen.getByText(/加入 2 個到行程/));

    expect(onAddItems.mock.calls[0][0][0].date).toBeUndefined();
  });

  it('加完之後說出加了幾個，清單收起來', async () => {
    vi.stubGlobal('fetch', respondWith(slices));
    const user = userEvent.setup();
    panel();

    await upload(user);
    await waitFor(() => expect(screen.getByText('大師兄牛肉麵')).toBeTruthy());
    await user.click(screen.getByText(/加入 2 個到行程/));

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
