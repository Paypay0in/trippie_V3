import { describe, expect, it } from 'vitest';
import { boughtFromReceipts } from './boughtFromReceipt';
import { Expense, ShoppingItem } from '../types';

/**
 * 「之後若用戶拍收據的時候 就要自動對比購物清單中的東西是否已經買到」.
 *
 * The comparison is automatic; the ticking is not. An unticked row that was
 * bought costs a glance at the shelf; a ticked row that was not costs the trip
 * home without the thing.
 */
const want = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: 'w1', name: 'SK-II 青春露', isPurchased: false, phase: 'during', ...over,
} as ShoppingItem);

const bill = (lines: Array<Record<string, unknown>>, over: Partial<Expense> = {}): Expense => ({
  id: 'e1', date: '2026-10-21', description: '松本清', twdAmount: 1200,
  receiptItems: lines, ...over,
} as unknown as Expense);

describe('boughtFromReceipts', () => {
  it('finds the row a receipt line names', () => {
    const [found] = boughtFromReceipts([want()], [bill([{ name: 'SK-II 青春露' }])]);

    expect(found.item.id).toBe('w1');
    expect(found.date).toBe('2026-10-21');
  });

  /* A till prints its own way, and a list row is what somebody typed. */
  it('matches when one name is inside the other', () => {
    const found = boughtFromReceipts([want()], [bill([{ name: 'SK-II 青春露 230ML' }])]);

    expect(found).toHaveLength(1);
  });

  it('reads the translated line too', () => {
    const found = boughtFromReceipts(
      [want({ name: '東京芭娜娜' })],
      [bill([{ name: '東京ばな奈', translatedName: '東京芭娜娜 8入' }])],
    );

    expect(found).toHaveLength(1);
  });

  /* A decision already made is not re-offered. */
  it('leaves out a row that is already ticked', () => {
    expect(boughtFromReceipts([want({ isPurchased: true })], [bill([{ name: 'SK-II 青春露' }])]))
      .toEqual([]);
  });

  /* 「水」 on a receipt is not evidence about a row called 「水」. */
  it('ignores a name too short to mean anything', () => {
    expect(boughtFromReceipts([want({ name: '水' })], [bill([{ name: '水' }])])).toEqual([]);
  });

  it('offers a row once however many lines name it', () => {
    const found = boughtFromReceipts(
      [want()],
      [bill([{ name: 'SK-II 青春露' }, { name: 'SK-II 青春露 230ML' }])],
    );

    expect(found).toHaveLength(1);
  });

  it('says nothing about a bill with no printed lines', () => {
    expect(boughtFromReceipts([want()], [bill([])])).toEqual([]);
  });

  it('says nothing when the list has nothing waiting', () => {
    expect(boughtFromReceipts([], [bill([{ name: 'SK-II 青春露' }])])).toEqual([]);
  });

  it('does not match a different product', () => {
    expect(boughtFromReceipts([want()], [bill([{ name: '雪肌精化粧水' }])])).toEqual([]);
  });
});
