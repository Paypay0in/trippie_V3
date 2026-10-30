/**
 * @vitest-environment jsdom
 *
 * 「我需要購物清單！」「購物清單是最需要的」.
 *
 * The list held a name and a tick. The mock has categories across the top,
 * 必買／想買 on the rows, the shop under the name and a quantity stepper on
 * the right.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShoppingListPanel from '../components/ShoppingListPanel';
import { SHOPPING_THUMB } from '../services/postPhotos';
import { clearProductImageCache } from '../services/productImageService';
import { clearPriceCheckCache } from '../services/priceCheckService';
import { ShoppingItem } from '../types';

afterEach(cleanup);

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: 'sk2', name: 'SK-II 青春露', isPurchased: false, phase: 'during',
  ...over,
} as ShoppingItem);

const show = (list: ShoppingItem[], over: Record<string, unknown> = {}) => {
  const onUpdateItem = vi.fn();
  render(
    <ShoppingListPanel
      title="購物清單"
      shoppingList={list}
      onAddItem={vi.fn()}
      onRemoveItem={vi.fn()}
      onUpdateItem={onUpdateItem}
      tripCountry="日本"
      residenceCountryCode="TW"
      {...over}
    />,
  );
  return { onUpdateItem };
};

describe('the categories', () => {
  /*
    Built from what is in the list, not declared: a trip to Tokyo has 美妝保養,
    a trip to Seoul has neither of these, and the wrong seven buckets is a
    list people stop filing into.
  */
  it('counts the ones the list actually has', () => {
    show([
      item({ id: 'a', category: '美妝保養' }),
      item({ id: 'b', category: '美妝保養' }),
      item({ id: 'c', category: '伴手禮' }),
    ]);

    expect(screen.getByTestId('shopping-category-全部').textContent).toContain('3');
    expect(screen.getByTestId('shopping-category-美妝保養').textContent).toContain('2');
    expect(screen.getByTestId('shopping-category-伴手禮').textContent).toContain('1');
  });

  it('narrows the list to one of them', () => {
    show([
      item({ id: 'a', name: 'SK-II', category: '美妝保養' }),
      item({ id: 'c', name: '東京芭娜娜', category: '伴手禮' }),
    ]);

    fireEvent.click(screen.getByTestId('shopping-category-伴手禮'));

    expect(screen.queryByText('SK-II')).toBeNull();
    expect(screen.getByText('東京芭娜娜')).toBeTruthy();
  });

  /* A list nobody has filed shows no chips rather than one that says 全部. */
  it('stays out of the way when nothing is filed', () => {
    show([item()]);

    expect(screen.queryByTestId('shopping-categories')).toBeNull();
  });
});

/*
  必買／想買 lives behind the row's 「⋯」, with the expense entry, the price
  comparison and the bin. Four controls on every row left the product name
  about a third of a phone's width.
*/
describe('必買 / 想買', () => {
  const openMenu = () => fireEvent.click(screen.getByTestId('shopping-menu-sk2'));

  it('shows what was said', () => {
    show([item({ priority: 'must' })]);
    openMenu();

    expect(screen.getByTestId('shopping-priority-sk2').textContent).toBe('必買');
  });

  /*
    Absent is absent. A 想買 that reads as 必買 is a shop somebody makes a
    detour for.
  */
  it('says nothing when nobody said', () => {
    show([item()]);
    openMenu();

    expect(screen.queryByTestId('shopping-priority-sk2')).toBeNull();
  });

  it('turns one into the other', () => {
    const { onUpdateItem } = show([item({ priority: 'want' })]);
    openMenu();

    fireEvent.click(screen.getByTestId('shopping-priority-sk2'));

    expect(onUpdateItem).toHaveBeenCalledWith('sk2', { priority: 'must' });
  });
});

describe('how many', () => {
  it('counts one when nobody said otherwise', () => {
    show([item()]);

    expect(screen.getByTestId('shopping-quantity-sk2').textContent).toBe('1');
  });

  it('goes up', () => {
    const { onUpdateItem } = show([item({ quantity: 2 })]);

    fireEvent.click(screen.getByTestId('shopping-more-sk2'));

    expect(onUpdateItem).toHaveBeenCalledWith('sk2', { quantity: 3 });
  });

  /* Zero of something is not on a shopping list; it is off it. */
  it('will not go below one', () => {
    show([item({ quantity: 1 })]);

    expect((screen.getByTestId('shopping-less-sk2') as HTMLButtonElement).disabled).toBe(true);
  });

  /* A stepper that cannot save is the dead tap this app keeps removing. */
  it('is not offered when the caller cannot save it', () => {
    show([item()], { onUpdateItem: undefined });

    expect(screen.queryByTestId('shopping-quantity-sk2')).toBeNull();
  });
});

/**
 * 「要找圖片」 — the screenshot the row was read out of.
 */
describe('the picture', () => {
  /* 「在網路上抓圖也很有幫助」 — offered on a row that has none. */
  it('offers to find one', () => {
    show([item()]);

    expect(screen.getByTestId('shopping-find-photo-sk2')).toBeTruthy();
  });

  it('does not offer it on a row that has one', () => {
    show([item({ photo: 'thumb' })]);

    expect(screen.queryByTestId('shopping-find-photo-sk2')).toBeNull();
  });

  /*
    A product shot nobody can place is believed because it looks like a
    product shot. The page it came from is shown under it.
  */
  it('says where a web picture came from', () => {
    show([item({ photo: 'https://img.example.com/a.jpg', photoSource: 'https://www.muji.com/p/1' })]);

    expect(screen.getByTestId('shopping-photo-source-sk2').textContent).toBe('muji.com');
  });

  /* His own screenshot has no page, and is not labelled as if it had one. */
  it('says nothing under his own screenshot', () => {
    show([item({ photo: 'data:image/jpeg;base64,thumb' })]);

    expect(screen.queryByTestId('shopping-photo-source-sk2')).toBeNull();
  });

  it('shows the one the row carries', () => {
    show([item({ photo: 'data:image/jpeg;base64,thumb' })]);

    expect(screen.getByTestId('shopping-photo-sk2').getAttribute('src'))
      .toBe('data:image/jpeg;base64,thumb');
  });

  /* Typed by hand, no picture — and no empty grey square either. */
  it('shows nothing for a row without one', () => {
    show([item()]);

    expect(screen.queryByTestId('shopping-photo-sk2')).toBeNull();
  });
});

describe('where to buy it', () => {
  it('shows the shop and the note', () => {
    show([item({ shop: '松本清 / 其他藥妝', description: '看看新款色號' })]);

    const row = screen.getByTestId('shopping-item-sk2');
    expect(row.textContent).toContain('松本清');
    expect(row.textContent).toContain('看看新款色號');
  });
});

/**
 * 「請100%還原這個設計」 — the third panel: progress, search, and the rows
 * grouped under foldable headings.
 */
describe('已買 N / M', () => {
  it('counts the whole list', () => {
    show([item({ id: 'a' }), item({ id: 'b', isPurchased: true })]);

    const bar = screen.getByTestId('shopping-progress');
    expect(bar.textContent).toContain('已買 1 / 2');
    expect(bar.textContent).toContain('50%');
  });

  /*
    A bar that moved when somebody tapped a chip would be measuring the filter
    rather than the shopping.
  */
  it('does not move when the list is filtered', () => {
    show([
      item({ id: 'a', category: '美妝保養' }),
      item({ id: 'b', category: '伴手禮', isPurchased: true }),
    ]);

    fireEvent.click(screen.getByTestId('shopping-category-美妝保養'));

    expect(screen.getByTestId('shopping-progress').textContent).toContain('已買 1 / 2');
  });
});

describe('searching', () => {
  it('finds a row by its shop', () => {
    show([
      item({ id: 'a', name: 'SK-II', shop: '松本清' }),
      item({ id: 'b', name: '東京芭娜娜', shop: '東京車站' }),
    ]);

    fireEvent.change(screen.getByTestId('shopping-search'), { target: { value: '松本' } });

    expect(screen.getByText('SK-II')).toBeTruthy();
    expect(screen.queryByText('東京芭娜娜')).toBeNull();
  });

  /* The brand lives in the note, and the placeholder promises brands. */
  it('finds a row by its brand', () => {
    show([item({ id: 'a', name: '青春露', description: 'SK-II · 230ml' })]);

    fireEvent.change(screen.getByTestId('shopping-search'), { target: { value: 'sk-ii' } });

    expect(screen.getByText('青春露')).toBeTruthy();
  });
});

describe('the sections', () => {
  it('groups the rows under their category', () => {
    show([item({ id: 'a', category: '美妝保養' })]);

    expect(screen.getByTestId('shopping-section-美妝保養').textContent).toContain('1');
  });

  /* A row nobody filed is still a row somebody has to buy. */
  it('gives the unfiled rows a heading of their own', () => {
    show([item({ id: 'a' })]);

    expect(screen.getByTestId('shopping-section-未分類')).toBeTruthy();
  });

  it('folds one away', () => {
    show([item({ id: 'a', name: 'SK-II', category: '美妝保養' })]);

    fireEvent.click(screen.getByTestId('shopping-section-toggle-美妝保養'));

    expect(screen.queryByText('SK-II')).toBeNull();
  });
});

describe('what it should cost', () => {
  it('shows an amount somebody entered', () => {
    show([item({ estimatedAmount: 5200, estimatedCurrency: 'NT$' })]);

    expect(screen.getByTestId('shopping-amount-sk2').textContent).toContain('5,200');
  });

  /* Never read off a screenshot, so most rows have none and say none. */
  it('shows nothing when nobody said', () => {
    show([item()]);

    expect(screen.queryByTestId('shopping-amount-sk2')).toBeNull();
  });
});

/**
 * 「之後若用戶拍收據的時候 就要自動對比購物清單中的東西是否已經買到」.
 *
 * The comparison is automatic; the ticking is not. An unticked row that was
 * bought costs a glance at the shelf; a ticked row that was not costs the trip
 * home without the thing.
 */
describe('what a receipt says was bought', () => {
  const receipt = [{
    id: 'e1', date: '2026-10-21', description: '松本清', twdAmount: 1200,
    receiptItems: [{ name: 'SK-II 青春露 230ML' }],
  }] as never;

  it('offers the row rather than ticking it', () => {
    const { onUpdateItem } = show([item()], { expenses: receipt });

    expect(screen.getByTestId('shopping-bought-offer').textContent).toContain('已經買到了嗎');
    expect(onUpdateItem).not.toHaveBeenCalled();
  });

  it('ticks it when the traveller says so', () => {
    const { onUpdateItem } = show([item()], { expenses: receipt });

    fireEvent.click(screen.getByTestId('shopping-mark-bought-sk2'));

    expect(onUpdateItem).toHaveBeenCalledWith('sk2', { isPurchased: true });
  });

  it('says nothing when no receipt names anything on the list', () => {
    show([item({ name: '雪肌精' })], { expenses: receipt });

    expect(screen.queryByTestId('shopping-bought-offer')).toBeNull();
  });

  /* A panel that cannot save the answer must not appear to ask. */
  it('does not ask when the caller cannot tick it', () => {
    show([item()], { expenses: receipt, onUpdateItem: undefined });

    expect(screen.queryByTestId('shopping-bought-offer')).toBeNull();
  });
});

/**
 * 「這排版真的不合理 另外 點擊照片要能變大」.
 *
 * The buttons sat on their own row but right-aligned under the text, leaving
 * a gap where the stepper should have been, and the product picture was a
 * 40px square that showed only that a picture existed.
 */
describe('the row', () => {
  const withPhoto = item({ id: 'p1', name: 'SABON Body Gelée', photo: 'bottle' });

  it('opens the product picture full screen', () => {
    show([withPhoto]);

    fireEvent.click(screen.getByTestId('shopping-photo-p1'));

    expect(screen.getByTestId('photo-lightbox-image').getAttribute('src')).toBe('bottle');
  });

  /* One picture needs no counter and no arrows. */
  it('shows it bare, because there is only one', () => {
    show([withPhoto]);
    fireEvent.click(screen.getByTestId('shopping-photo-p1'));

    expect(screen.queryByTestId('photo-lightbox-count')).toBeNull();
  });
});

/*
  「購物清單的照片這麼糊 有跟沒有一樣」 — the picture was stored at 320px,
  sized for the 40px square it was drawn in, which is unreadable the moment
  the row can be opened full screen. It is a receipt's size now, and may stay
  that size because the list reaches the server: a confirmed product photo is
  a cache that `withoutCloudHeldPhotos` can free.
*/
describe('how big a product picture is kept', () => {
  it('is stored at a size worth opening', () => {
    expect(SHOPPING_THUMB.maxEdge).toBeGreaterThanOrEqual(900);
  });
});

/**
 * 「我之後可以篩選商品金額」 — the funnel beside the search box.
 *
 * A range rather than a sort: the question a list gets asked on the way to the
 * counter is 「什麼還沒買、而且不貴」, and a sorted list still makes somebody
 * scroll past the expensive half.
 */
describe('依金額篩選', () => {
  const openFunnel = () => fireEvent.click(screen.getByTestId('shopping-amount-filter'));

  it('keeps what is inside the range', () => {
    show([
      item({ id: 'cheap', name: '腮紅', estimatedAmount: 420 }),
      item({ id: 'dear', name: '青春露', estimatedAmount: 5200 }),
    ]);
    openFunnel();

    fireEvent.change(screen.getByTestId('shopping-amount-max'), { target: { value: '1000' } });

    expect(screen.getByText('腮紅')).toBeTruthy();
    expect(screen.queryByText('青春露')).toBeNull();
  });

  it('reads either end on its own as a range', () => {
    show([
      item({ id: 'cheap', name: '腮紅', estimatedAmount: 420 }),
      item({ id: 'dear', name: '青春露', estimatedAmount: 5200 }),
    ]);
    openFunnel();

    fireEvent.change(screen.getByTestId('shopping-amount-min'), { target: { value: '1000' } });

    expect(screen.getByText('青春露')).toBeTruthy();
    expect(screen.queryByText('腮紅')).toBeNull();
  });

  /*
    A row nobody has priced is not 0 元 and is not 貴. It leaves the list
    while a range is set, and the list says how many — a row that vanishes
    without a reason is a row lost.
  */
  it('says how many have no price rather than hiding them silently', () => {
    show([
      item({ id: 'priced', name: '腮紅', estimatedAmount: 420 }),
      item({ id: 'unpriced', name: '東京芭娜娜' }),
    ]);
    openFunnel();

    fireEvent.change(screen.getByTestId('shopping-amount-max'), { target: { value: '1000' } });

    expect(screen.queryByText('東京芭娜娜')).toBeNull();
    expect(screen.getByTestId('shopping-amount-unpriced').textContent).toContain('1');
  });

  it('shows everything again once the range is cleared', () => {
    show([item({ id: 'unpriced', name: '東京芭娜娜' })]);
    openFunnel();
    fireEvent.change(screen.getByTestId('shopping-amount-max'), { target: { value: '1000' } });

    fireEvent.click(screen.getByTestId('shopping-amount-clear'));

    expect(screen.getByText('東京芭娜娜')).toBeTruthy();
  });
});

/**
 * The tick, where a list is ticked.
 *
 * Bought rows used to drop into a grey block at the bottom with a line through
 * the name. 「已購買」 in the category it was filed under is how a list is read
 * on the second day: what is left in 美妝保養, not what is left overall.
 */
describe('打勾', () => {
  it('marks a row bought from the row', () => {
    const { onUpdateItem } = show([item()]);

    fireEvent.click(screen.getByTestId('shopping-tick-sk2'));

    expect(onUpdateItem).toHaveBeenCalledWith('sk2', { isPurchased: true });
  });

  it('unticks one that was already bought', () => {
    const { onUpdateItem } = show([item({ isPurchased: true })]);

    fireEvent.click(screen.getByTestId('shopping-tick-sk2'));

    expect(onUpdateItem).toHaveBeenCalledWith('sk2', { isPurchased: false });
  });

  it('leaves a bought row in its own category', () => {
    show([item({ category: '美妝保養', isPurchased: true })]);

    expect(screen.getByTestId('shopping-section-美妝保養').textContent).toContain('SK-II');
    expect(screen.getByTestId('shopping-status-sk2').textContent).toBe('已購買');
  });
});

/**
 * 分類管理 — renaming a heading moves every row filed under it, because the
 * heading is only ever the word on the rows.
 */
describe('分類管理', () => {
  it('renames every row under the heading', () => {
    const { onUpdateItem } = show([
      item({ id: 'a', category: '美妝保養' }),
      item({ id: 'b', category: '美妝保養' }),
      item({ id: 'c', category: '伴手禮' }),
    ]);

    fireEvent.click(screen.getByTestId('shopping-manage-categories'));
    const field = screen.getByTestId('shopping-category-name-美妝保養');
    fireEvent.change(field, { target: { value: '保養品' } });
    fireEvent.blur(field);

    expect(onUpdateItem).toHaveBeenCalledWith('a', { category: '保養品' });
    expect(onUpdateItem).toHaveBeenCalledWith('b', { category: '保養品' });
    expect(onUpdateItem).not.toHaveBeenCalledWith('c', { category: '保養品' });
  });

  /* An empty name would file the rows under nothing at all. */
  it('ignores an empty name', () => {
    const { onUpdateItem } = show([item({ category: '美妝保養' })]);

    fireEvent.click(screen.getByTestId('shopping-manage-categories'));
    const field = screen.getByTestId('shopping-category-name-美妝保養');
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);

    expect(onUpdateItem).not.toHaveBeenCalled();
  });
});

/** 新增商品 — the add box is where the errand ends, not where reading begins. */
describe('新增商品', () => {
  it('opens the box behind the button', () => {
    show([item()]);

    expect(screen.queryByTestId('shopping-add-input')).toBeNull();
    fireEvent.click(screen.getByTestId('shopping-add-open'));

    expect(screen.getByTestId('shopping-add-input')).toBeTruthy();
  });
});

/**
 * 「每一張都要換成搜尋結果的圖片 不要用截圖」.
 *
 * A 小紅書 post photographed on a phone shows where the thing was seen, not
 * what it looks like: captions across it, three other products beside it,
 * somebody's thumb. On a shelf, hunting one bottle, that is nearly useless.
 */
describe('全部換成商品圖', () => {
  const found = { imageUrl: 'https://img.example.com/a.jpg', pageUrl: 'https://muji.com/p/1' };

  beforeEach(() => {
    clearProductImageCache();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => found,
    })) as unknown as typeof fetch);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('offers it while a screenshot is still there', () => {
    show([item({ photo: 'data:image/jpeg;base64,shot' })]);

    expect(screen.getByTestId('shopping-swap-photos').textContent).toContain('1');
  });

  /*
    A list where every row already has a web picture can still be re-run:
    「這個圖明顯就錯誤」 — the brand handed to the search had been the row's
    whole note, so every picture on the list was found by a query that could
    not have found the right one.
  */
  it('offers to look again when nothing is wearing a screenshot', () => {
    show([item({ photo: 'https://img.example.com/a.jpg' })]);

    expect(screen.getByTestId('shopping-swap-photos').textContent).toContain('全部重新找商品圖');
  });

  it('says 換成 rather than 重新找 while a screenshot is still there', () => {
    show([item({ photo: 'data:image/jpeg;base64,shot' })]);

    expect(screen.getByTestId('shopping-swap-photos').textContent).toContain('全部換成商品圖');
  });

  it('counts a row with no picture at all', () => {
    show([item()]);

    expect(screen.getByTestId('shopping-swap-photos').textContent).toContain('1');
  });

  it('replaces the screenshot with what it found', async () => {
    const { onUpdateItem } = show([item({ photo: 'data:image/jpeg;base64,shot' })]);

    fireEvent.click(screen.getByTestId('shopping-swap-photos'));

    await waitFor(() => expect(onUpdateItem).toHaveBeenCalledWith('sk2', {
      photo: found.imageUrl,
      photoSource: found.pageUrl,
    }));
  });

  /* Having no picture is worse than having the wrong kind of one. */
  it('leaves the screenshot alone when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ imageUrl: '' }),
    })) as unknown as typeof fetch);
    const { onUpdateItem } = show([item({ photo: 'data:image/jpeg;base64,shot' })]);

    fireEvent.click(screen.getByTestId('shopping-swap-photos'));

    await waitFor(() => expect(screen.getByTestId('shopping-swap-photos')).toBeTruthy());
    expect(onUpdateItem).not.toHaveBeenCalled();
  });

  /* One row at a time, for when the batch found the wrong bottle. */
  it('swaps one row from its menu', async () => {
    const { onUpdateItem } = show([item({ photo: 'data:image/jpeg;base64,shot' })]);

    fireEvent.click(screen.getByTestId('shopping-menu-sk2'));
    fireEvent.click(screen.getByTestId('shopping-swap-photo-sk2'));

    await waitFor(() => expect(onUpdateItem).toHaveBeenCalledWith('sk2', {
      photo: found.imageUrl,
      photoSource: found.pageUrl,
    }));
  });
});

/**
 * 「我希望不要需要我點選後才查價 一開始就要直接查了！然後日本價格：台灣價格：
 * 這樣條列 沒查到就說沒查到」.
 *
 * Both regions are always printed. A region that is simply missing reads as a
 * region nobody looked at, and then the traveller does the looking themselves.
 */
describe('價格', () => {
  const quote = (over: Record<string, unknown> = {}) => ({
    countryCode: 'TW', shop: 'shop.muji.tw', amount: 135, currency: 'TWD',
    sourceUrl: 'https://shop.muji.tw/SalePage/Index/1', ...over,
  });

  const answer = (body: Record<string, unknown>) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ readAt: '2026-10-22T09:00:00.000Z', ...body }),
    })) as unknown as typeof fetch);
  };

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('looks the price up without being asked', async () => {
    answer({ quotes: [quote()] });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.getByTestId('shopping-prices-TW-sk2').textContent).toContain('TWD 135');
  });

  it('prints both regions, 日本 first', async () => {
    answer({ quotes: [quote()] });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    const lines = screen.getByTestId('shopping-prices-sk2').textContent || '';
    expect(lines.indexOf('日本價格')).toBeLessThan(lines.indexOf('台灣價格'));
  });

  /* The whole point: a missing region says so rather than being absent. */
  it('says 沒查到 for the region it found nothing in', async () => {
    answer({ quotes: [quote()] });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.getByTestId('shopping-prices-JP-sk2').textContent).toContain('沒查到');
    expect(screen.getByTestId('shopping-prices-TW-sk2').textContent).not.toContain('沒查到');
  });

  it('says 沒查到 on both lines when it found nothing at all', async () => {
    answer({ quotes: [] });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.getByTestId('shopping-prices-JP-sk2').textContent).toContain('沒查到');
    expect(screen.getByTestId('shopping-prices-TW-sk2').textContent).toContain('沒查到');
  });

  /*
    「額度用完了」 and 「這個商品沒有價格」 ask opposite things of the reader,
    so the server's own sentence is kept when it has one.
  */
  it('keeps the reason when the lookup itself was blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: '網路查詢的額度用完了。' }),
    })) as unknown as typeof fetch);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-empty-sk2').textContent)
      .toContain('額度用完了'));
  });

  it('says it is still looking before the answer arrives', () => {
    answer({ quotes: [quote()] });
    show([item()]);

    expect(screen.getByTestId('shopping-prices-pending-sk2').textContent).toContain('查價中');
  });

  /* One request per product, however many rows share the page. */
  it('asks once per product', async () => {
    answer({ quotes: [quote()] });
    show([item({ id: 'a' }), item({ id: 'b' })]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-a')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('shopping-prices-b')).toBeTruthy());
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

/**
 * 「日本價格有日幣金額 那要直接換算：約台幣xxxx」.
 *
 * 約, and never 「這邊比較便宜」: which side wins needs a tax-refund
 * assumption and a view on baggage, and a sentence this app wrote would be
 * read as advice.
 */
describe('約台幣', () => {
  const answerWith = (quotes: unknown[]) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes, readAt: '2026-10-22T09:00:00.000Z' }),
    })) as unknown as typeof fetch);
  };

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows the converted figure beside a yen price', async () => {
    answerWith([{
      countryCode: 'JP', shop: 'matsukiyo.co.jp', amount: 3080, currency: 'JPY',
      approxHome: 643, homeCurrency: 'TWD', sourceUrl: 'https://www.matsukiyo.co.jp/p/1',
    }]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-approx-sk2').textContent)
      .toContain('約台幣 643'));
  });

  /* A converted figure and an invented one look identical on screen. */
  it('shows nothing when the rate could not be read', async () => {
    answerWith([{
      countryCode: 'JP', shop: 'matsukiyo.co.jp', amount: 3080, currency: 'JPY',
      homeCurrency: 'TWD', sourceUrl: 'https://www.matsukiyo.co.jp/p/1',
    }]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-approx-sk2')).toBeNull();
  });

  /* 「約台幣 135」 under TWD 135 is a sentence that says nothing twice. */
  it('says nothing beside a price already in TWD', async () => {
    answerWith([{
      countryCode: 'TW', shop: 'shop.muji.tw', amount: 135, currency: 'TWD',
      approxTwd: 135, sourceUrl: 'https://shop.muji.tw/p/1',
    }]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-approx-sk2')).toBeNull();
  });
});

/**
 * 「我覺得目前很多價格錯誤」.
 *
 * An audit of thirty-two live quotes: seventeen matched the shop's own page,
 * four were links that did not open, and every wrong figure was read out of a
 * search snippet rather than stated by the page.
 */
describe('未驗證', () => {
  const answerWith = (quotes: unknown[]) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes, readAt: '2026-10-22T09:00:00.000Z' }),
    })) as unknown as typeof fetch);
  };

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('marks a price the shop’s page did not state', async () => {
    answerWith([{
      countryCode: 'TW', shop: 'tw.buy.yahoo.com', amount: 3899, currency: 'TWD',
      verified: false, sourceUrl: 'https://tw.buy.yahoo.com/p/1',
    }]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-unverified-sk2')).toBeTruthy());
  });

  it('says nothing beside a price the page stated', async () => {
    answerWith([{
      countryCode: 'TW', shop: 'shop.muji.tw', amount: 135, currency: 'TWD',
      verified: true, sourceUrl: 'https://shop.muji.tw/p/1',
    }]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-unverified-sk2')).toBeNull();
  });

  /* A quote from before this existed says nothing either: absent is not false. */
  it('says nothing when nobody recorded either way', async () => {
    answerWith([{
      countryCode: 'TW', shop: 'shop.muji.tw', amount: 135, currency: 'TWD',
      sourceUrl: 'https://shop.muji.tw/p/1',
    }]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-unverified-sk2')).toBeNull();
  });
});

/**
 * 「我覺得你要區分很清楚 日本的價格來源 以及台灣的價格來源」.
 *
 * Three ways a quote gets filed under a country, and they are not equally
 * sure. The address says so; the currency the shop published says so; or
 * only the language of the page does — and `rakuraku-jp.com`, which buys in
 * Japan and sells to Taiwan, is exactly the case that reading cannot settle.
 */
describe('價格來源', () => {
  const answerWith = (quotes: unknown[]) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes, readAt: '2026-10-22T09:00:00.000Z' }),
    })) as unknown as typeof fetch);
  };

  const quote = (over: Record<string, unknown> = {}) => ({
    countryCode: 'TW', shop: 'shop.muji.tw', amount: 135, currency: 'TWD',
    verified: true, placement: 'host', sourceUrl: 'https://shop.muji.tw/p/1', ...over,
  });

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('names the shop on the line, as a link', async () => {
    answerWith([quote()]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-TW-sk2').textContent)
      .toContain('shop.muji.tw'));
    expect(screen.getByText('shop.muji.tw').getAttribute('href')).toBe('https://shop.muji.tw/p/1');
  });

  it('marks a country read off the page’s language', async () => {
    answerWith([quote({ shop: 'rakuraku-jp.com', placement: 'language' })]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-inferred-sk2').textContent)
      .toContain('國別推定'));
  });

  it('says nothing when the shop’s address settled it', async () => {
    answerWith([quote()]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-inferred-sk2')).toBeNull();
  });

  /* The currency a shop published is its own statement, not an inference. */
  it('says nothing when the published currency settled it', async () => {
    answerWith([quote({ placement: 'mark' })]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-inferred-sk2')).toBeNull();
  });
});

/**
 * 「已驗證」 used to mean only 「the page printed this number」.
 *
 * 米糠发酵修护舒缓湿敷面膜 carried that badge while quoting a page titled
 * 米糠發酵導入美容液 — right shop, real price, wrong product. The row now says
 * what was actually checked.
 */
describe('比對狀態', () => {
  const answerWith = (quotes: unknown[]) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes, readAt: '2026-10-22T09:00:00.000Z' }),
    })) as unknown as typeof fetch);
  };

  const quote = (over: Record<string, unknown> = {}) => ({
    countryCode: 'TW', shop: 'shop.muji.tw', amount: 135, currency: 'TWD',
    verified: true, placement: 'host', match: 'exact',
    sourceUrl: 'https://shop.muji.tw/p/1', ...over,
  });

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('says nothing when the page sells exactly this product', async () => {
    answerWith([quote()]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-sk2')).toBeTruthy());
    expect(screen.queryByTestId('shopping-probable-sk2')).toBeNull();
    expect(screen.queryByTestId('shopping-unverified-sk2')).toBeNull();
  });

  it('marks a page that might be selling it', async () => {
    answerWith([quote({ match: 'probable', matchReasonKey: 'shopping.match.namePartly' })]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-probable-sk2').textContent)
      .toContain('可能同款'));
  });

  /* A snippet reading compared the title with nothing at all. */
  it('says 未比對商品 for a figure read off a search snippet', async () => {
    answerWith([quote({ verified: false, match: undefined })]);
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-unverified-sk2').textContent)
      .toContain('未比對商品'));
  });
});

/**
 * 「The UI should not collapse every failure into 沒查到」.
 *
 * Shops found and none of them saying what this costs sends a traveller to go
 * and look. Nothing matching the search at all tells them the name is what
 * needs fixing. They had been the same sentence.
 */
describe('為什麼沒有價格', () => {
  const answerWith = (body: Record<string, unknown>) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes: [], readAt: '2026-10-22T09:00:00.000Z', ...body }),
    })) as unknown as typeof fetch);
  };

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('says the shops were found but would not say', async () => {
    answerWith({ byCountry: { JP: 'found_no_price', TW: 'not_found' } });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-empty-JP-sk2').textContent)
      .toContain('沒標價'));
    expect(screen.getByTestId('shopping-empty-TW-sk2').textContent).toContain('沒查到');
  });

  /*
    「找不到muji根本不合理」 — shop.muji.tw was found and does publish prices;
    what it sells under that search is 米糠發酵導入美容液, not the mask. Saying
    「頁面沒標價」 there was false, and it is the one state that tells the
    traveller the name is what needs fixing.
  */
  it('says when the shops price a different product', async () => {
    answerWith({ byCountry: { JP: 'no_match', TW: 'no_match' } });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-empty-TW-sk2').textContent)
      .toContain('別的商品'));
  });

  /* An answer from before this existed still reads as it did. */
  it('falls back to 沒查到 when nobody said why', async () => {
    answerWith({});
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-empty-JP-sk2').textContent)
      .toContain('沒查到'));
  });
});

/**
 * 「畫面沒變」.
 *
 * This panel is mounted on three screens and only one of them was told which
 * trip it belongs to. On the other two the country pair was empty, so the
 * whole price block rendered nothing — not a price, not 沒查到, nothing.
 */
describe('a screen that was not told which trip this is', () => {
  const answerWith = (body: Record<string, unknown>) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ readAt: '2026-10-22T09:00:00.000Z', ...body }),
    })) as unknown as typeof fetch);
  };

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const bare = (list: Parameters<typeof show>[0]) =>
    show(list, { tripCountry: undefined, residenceCountryCode: undefined });

  it('still shows the prices it was sent', async () => {
    answerWith({ quotes: [{
      countryCode: 'JP', shop: 'matsukiyo.co.jp', amount: 3080, currency: 'JPY',
      verified: true, match: 'exact', sourceUrl: 'https://matsukiyo.co.jp/p/1',
    }] });
    bare([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-prices-JP-sk2').textContent)
      .toContain('JPY 3,080'));
  });

  /* And still says why, for a country that answered with nothing. */
  it('still says why a country has none', async () => {
    answerWith({ quotes: [], byCountry: { JP: 'found_no_price', TW: 'not_found' } });
    bare([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-empty-JP-sk2').textContent)
      .toContain('沒標價'));
  });
});

/**
 * 「Never display quota failure as if the product has no price」.
 *
 * `catch(() => [])` turned the search provider's 429 into an empty list, and
 * every stage downstream read that as 「no shop sells this」. One afternoon
 * every row said 沒查到 at once and nothing anywhere said why.
 */
describe('搜尋本身壞掉的時候', () => {
  const answerWith = (body: Record<string, unknown>) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ quotes: [], readAt: '2026-10-22T09:00:00.000Z', ...body }),
    })) as unknown as typeof fetch);
  };

  beforeEach(() => { clearPriceCheckCache(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('says the allowance ran out, not that there is no price', async () => {
    answerWith({ byCountry: { JP: 'quota_exceeded', TW: 'quota_exceeded' } });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-empty-JP-sk2').textContent)
      .toContain('額度用完'));
  });

  it('says the search would not answer', async () => {
    answerWith({ byCountry: { JP: 'search_unavailable', TW: 'not_found' } });
    show([item()]);

    await waitFor(() => expect(screen.getByTestId('shopping-empty-JP-sk2').textContent)
      .toContain('暫時不通'));
    expect(screen.getByTestId('shopping-empty-TW-sk2').textContent).toContain('沒查到');
  });
});
