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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ShoppingListPanel from '../components/ShoppingListPanel';
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

describe('必買 / 想買', () => {
  it('shows what was said', () => {
    show([item({ priority: 'must' })]);

    expect(screen.getByTestId('shopping-priority-sk2').textContent).toBe('必買');
  });

  /*
    Absent is absent. A 想買 that reads as 必買 is a shop somebody makes a
    detour for.
  */
  it('says nothing when nobody said', () => {
    show([item()]);

    expect(screen.queryByTestId('shopping-priority-sk2')).toBeNull();
  });

  it('turns one into the other', () => {
    const { onUpdateItem } = show([item({ priority: 'want' })]);

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
