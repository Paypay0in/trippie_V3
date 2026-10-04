import { describe, expect, it } from 'vitest';
import { isForeignSplit, resolveExactSplit, splitEntryToTwd, splitTwdToEntry } from './exactSplitCurrency';

/**
 * 「該筆帳的金額是用韓幣計價 但是分帳的時候只能顯示用台幣分帳 是錯誤的」.
 *
 * The exact-split boxes were labelled TWD and held TWD, so splitting a 28,000
 * KRW dinner meant converting it in your head before typing — while the number
 * the traveller has is the one printed on the bill in front of them.
 */

const KRW = { currency: 'KRW', exchangeRate: 0.023 };

describe('isForeignSplit', () => {
  it('is false for a bill already in the ledger’s currency', () => {
    expect(isForeignSplit('TWD', 1)).toBe(false);
    expect(isForeignSplit('twd', 1)).toBe(false);
  });

  it('is false without a usable rate', () => {
    // Without a rate nothing can be converted, and pretending otherwise would
    // store a won figure as if it were TWD.
    expect(isForeignSplit('KRW', 0)).toBe(false);
    expect(isForeignSplit('KRW', undefined)).toBe(false);
  });

  it('is true for a foreign bill with a rate', () => {
    expect(isForeignSplit('KRW', 0.023)).toBe(true);
  });
});

describe('resolveExactSplit', () => {
  const dinner = { amount: 28000, totalTwd: 644, ...KRW };

  it('stores a share typed in won as its TWD value', () => {
    const result = resolveExactSplit({ ...dinner, typed: { gina: 10000 }, remainderMemberId: 'north' });

    expect(Math.round(result.allocations.gina)).toBe(230);
  });

  it('leaves the rest to the last beneficiary', () => {
    const result = resolveExactSplit({ ...dinner, typed: { gina: 10000 }, remainderMemberId: 'north' });

    expect(Math.round(result.allocations.north)).toBe(414);
  });

  it('adds up to the bill exactly', () => {
    // The remainder comes off the TWD total rather than being converted from
    // the leftover: converting each share separately leaves a rounding gap, and
    // a settlement that is 1 元 short is one somebody has to argue about.
    const result = resolveExactSplit({ ...dinner, typed: { gina: 9333 }, remainderMemberId: 'north' });

    const total = Object.values(result.allocations).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(644, 6);
  });

  it('reports the remainder in the currency the boxes are in', () => {
    const result = resolveExactSplit({ ...dinner, typed: { gina: 10000 }, remainderMemberId: 'north' });

    expect(result.remainderEntry).toBe(18000);
  });

  it('flags shares that exceed the bill, in the bill’s own currency', () => {
    expect(resolveExactSplit({ ...dinner, typed: { gina: 30000 }, remainderMemberId: 'north' }).exceedsTotal).toBe(true);
    expect(resolveExactSplit({ ...dinner, typed: { gina: 28000 }, remainderMemberId: 'north' }).exceedsTotal).toBe(false);
  });

  it('behaves as before for a bill in TWD', () => {
    const result = resolveExactSplit({
      amount: 652, totalTwd: 652, currency: 'TWD', exchangeRate: 1,
      typed: { gina: 300 }, remainderMemberId: 'north',
    });

    expect(result.allocations).toEqual({ gina: 300, north: 352 });
    expect(result.remainderEntry).toBe(352);
  });

  it('ignores a negative or unreadable share rather than crediting it', () => {
    const result = resolveExactSplit({ ...dinner, typed: { gina: -5000, sam: NaN }, remainderMemberId: 'north' });

    expect(result.allocations.gina).toBeUndefined();
    expect(Math.round(result.allocations.north)).toBe(644);
  });
});

describe('reopening a saved split', () => {
  it('shows won again, not the TWD it settles in', () => {
    expect(Math.round(splitTwdToEntry(230, 'KRW', 0.023))).toBe(10000);
  });

  it('round-trips a typed share', () => {
    expect(Math.round(splitTwdToEntry(splitEntryToTwd(10000, 'KRW', 0.023), 'KRW', 0.023))).toBe(10000);
  });
});
