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

describe('where to buy it', () => {
  it('shows the shop and the note', () => {
    show([item({ shop: '松本清 / 其他藥妝', description: '看看新款色號' })]);

    const row = screen.getByTestId('shopping-item-sk2');
    expect(row.textContent).toContain('松本清');
    expect(row.textContent).toContain('看看新款色號');
  });
});
