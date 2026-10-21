/**
 * @vitest-environment jsdom
 *
 * 「先記著本機 我在日本沒帶電腦」 — `expenses.rating` does not exist yet.
 *
 * A rating kept only on the expense would have been wiped by the next cloud
 * read: the server's row wins and has no rating in it, so every star given
 * today would survive until the next sync and then vanish with nothing on
 * screen to say so.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadStatedRatings,
  saveStatedRatings,
  setStatedRating,
  withStatedRatings,
} from './statedRatings';

afterEach(() => localStorage.clear());

describe('statedRatings', () => {
  it('remembers a rating across a reload', () => {
    saveStatedRatings(setStatedRating({}, 'e1', 4));

    expect(loadStatedRatings()).toEqual({ e1: 4 });
  });

  /* Clearing the stars has to remove it, not store a zero. */
  it('forgets one that was cleared', () => {
    expect(setStatedRating({ e1: 4 }, 'e1', undefined)).toEqual({});
  });

  it('refuses a rating outside one to five', () => {
    expect(setStatedRating({}, 'e1', 0)).toEqual({});
    expect(setStatedRating({}, 'e1', 6)).toEqual({});
    expect(setStatedRating({}, 'e1', 2.5)).toEqual({});
  });

  it('survives a key that is not an object', () => {
    localStorage.setItem('trippie_expense_ratings_v1', '[1,2]');

    expect(loadStatedRatings()).toEqual({});
  });
});

describe('withStatedRatings', () => {
  const bill = (id: string, rating?: number) => ({ id, ...(rating ? { rating } : {}) });

  it('puts the rating back on the bill', () => {
    expect(withStatedRatings([bill('e1')], { e1: 5 })).toEqual([{ id: 'e1', rating: 5 }]);
  });

  /*
    The day the column lands, the server's value is the real one and this has
    to stop overriding it — without anybody remembering to come back here.
  */
  it('never overrides a rating the bill already carries', () => {
    expect(withStatedRatings([bill('e1', 2)], { e1: 5 })).toEqual([{ id: 'e1', rating: 2 }]);
  });

  it('leaves the list alone when nothing was rated', () => {
    const bills = [bill('e1')];

    expect(withStatedRatings(bills, {})).toBe(bills);
  });
});
