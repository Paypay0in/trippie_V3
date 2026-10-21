import { describe, expect, it } from 'vitest';
import {
  candidateDetail,
  candidateToShoppingItem,
  candidatesFromReading,
  mergeShoppingItems,
} from './shoppingFromScreenshots';
import { ShoppingItem } from '../types';

/**
 * 「上傳截圖 → AI 辨識整理 → 加入購物清單」.
 *
 * The model is guessing at the size and the shop far more often than at the
 * name. Nothing here writes anything; it turns a reading into rows a traveller
 * ticks.
 */
describe('candidatesFromReading', () => {
  it('reads the rows it was given', () => {
    const rows = candidatesFromReading({
      products: [{ name: 'SK-II 青春露', brand: 'SK-II', spec: '230ml', shop: '松本清', category: '美妝保養' }],
    });

    expect(rows[0]).toMatchObject({
      name: 'SK-II 青春露', brand: 'SK-II', spec: '230ml', shop: '松本清', category: '美妝保養',
    });
  });

  /* Nothing to judge is nothing to show, and a tick against it writes nothing. */
  it('drops a row with no name', () => {
    expect(candidatesFromReading({ products: [{ brand: 'SK-II' }] })).toEqual([]);
  });

  it('leaves out what the picture did not say', () => {
    const [row] = candidatesFromReading({ products: [{ name: '東京芭娜娜', spec: '  ' }] });

    expect(row).not.toHaveProperty('spec');
    expect(row).not.toHaveProperty('shop');
  });

  /* A category the model invented belongs in 其他, not in a seventh chip. */
  it('folds an unknown category into 其他', () => {
    const [row] = candidatesFromReading({ products: [{ name: 'x', category: '可愛小物' }] });

    expect(row.category).toBe('其他');
  });

  it('survives a reading that is not a list', () => {
    expect(candidatesFromReading({ products: 'nope' })).toEqual([]);
    expect(candidatesFromReading(null)).toEqual([]);
  });
});

describe('candidateToShoppingItem', () => {
  /*
    The brand and size go in the note, not the name: the name is what gets
    compared, and 「SK-II 青春露 230ml」 and 「SK-II 青春露」 are the same bottle.
  */
  it('keeps the name clean and the detail in the note', () => {
    const item = candidateToShoppingItem(
      { id: 'a', name: 'SK-II 青春露', brand: 'SK-II', spec: '230ml' },
      'during',
      () => 'id-1',
    );

    expect(item.name).toBe('SK-II 青春露');
    expect(item.description).toBe('SK-II · 230ml');
  });

  /* A screenshot is not a statement of urgency. */
  it('claims nothing about 必買', () => {
    const item = candidateToShoppingItem({ id: 'a', name: 'x' }, 'during', () => 'id-1');

    expect(item).not.toHaveProperty('priority');
  });
});

describe('mergeShoppingItems', () => {
  const row = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
    id: 'x', name: 'SK-II 青春露', isPurchased: false, phase: 'during', ...over,
  } as ShoppingItem);

  it('adds what is new', () => {
    const { items, added } = mergeShoppingItems([], [row()]);

    expect(added).toBe(1);
    expect(items).toHaveLength(1);
  });

  /* Two screenshots of the same bottle are one bottle. */
  it('does not add the same thing twice', () => {
    const { items, added, merged } = mergeShoppingItems([row()], [row({ id: 'y', name: 'sk-ii  青春露' })]);

    expect(items).toHaveLength(1);
    expect(added).toBe(0);
    expect(merged).toBe(1);
  });

  /* A reading nobody checked must not overwrite a line the traveller wrote. */
  it('fills the gaps without replacing an answer', () => {
    const existing = row({ description: '我自己寫的', shop: undefined });

    const { items } = mergeShoppingItems([existing], [row({ id: 'y', description: 'AI 讀的', shop: '松本清' })]);

    expect(items[0].description).toBe('我自己寫的');
    expect(items[0].shop).toBe('松本清');
  });

  /* The same name in another phase is another list. */
  it('keeps the phases apart', () => {
    const { items, added } = mergeShoppingItems([row()], [row({ id: 'y', phase: 'pre' })]);

    expect(added).toBe(1);
    expect(items).toHaveLength(2);
  });
});

describe('candidateDetail', () => {
  it('is empty when the picture said neither', () => {
    expect(candidateDetail({ id: 'a', name: 'x' })).toBe('');
  });
});
