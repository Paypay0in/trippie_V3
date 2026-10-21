import { describe, expect, it } from 'vitest';
import { spendAtPlace, spendSummary } from './spendAtPlace';
import { Expense, SavedTravelInspiration } from '../types';

/**
 * 「這個可以 match 到我收藏的店舖中，能讓收藏清單中看到我在記帳下寫的備註嗎與圖片嗎？」
 *
 * The collection calls this restaurant 「Kurofunetei」 and the receipt calls it
 * 「黑船亭 洋食料理」, which is exactly why the join is on `merchantPlaceId` and
 * not on anything anybody typed.
 */
const PLACE = 'ChIJ-kurofunetei';

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i', savedByUserId: 'me', placeName: 'Kurofunetei', placeId: PLACE,
  country: '日本', city: '東京', notes: [],
  sourcePostId: 'p', sourceSliceId: 's', sourceCreatorId: 'c', sourceNoteIds: [],
  savedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as SavedTravelInspiration);

const bill = (over: Partial<Expense> = {}): Expense => ({
  id: 'e', date: '2026-10-20', description: '黑船亭 洋食料理',
  twdAmount: 882, amountOriginal: 4300, currency: 'JPY', exchangeRate: 0.205,
  category: '餐飲', phase: 'during', merchantPlaceId: PLACE,
  ...over,
} as Expense);

describe('spendAtPlace', () => {
  it('finds the bill recorded at that place', () => {
    expect(spendAtPlace(saved(), [bill()])).toEqual([{
      expenseId: 'e', date: '2026-10-20', description: '黑船亭 洋食料理', twdAmount: 882,
    }]);
  });

  it('carries the note and the receipt photo', () => {
    const [found] = spendAtPlace(saved(), [bill({
      note: '蘑菇義大利麵很好吃', receiptPhotos: ['data:image/jpeg;base64,xxx', 'second'],
    })]);

    expect(found).toMatchObject({ note: '蘑菇義大利麵很好吃', photo: 'data:image/jpeg;base64,xxx' });
  });

  /*
    The names do not match and never will. A loose name rule would attach the
    wrong receipt to the wrong shop, which on a screen about money is worse
    than showing nothing.
  */
  it('ignores a bill that only shares a name', () => {
    expect(spendAtPlace(saved(), [bill({ merchantPlaceId: undefined, description: 'Kurofunetei' })]))
      .toEqual([]);
  });

  it('says nothing for a saved place that was never resolved', () => {
    expect(spendAtPlace(saved({ placeId: undefined }), [bill()])).toEqual([]);
  });

  it('ignores somebody else\'s shop', () => {
    expect(spendAtPlace(saved(), [bill({ merchantPlaceId: 'ChIJ-other' })])).toEqual([]);
  });

  /* 「上次在這裡花了多少」 is asked about the last time. */
  it('puts the most recent visit first', () => {
    const twice = [bill({ id: 'old', date: '2026-03-02' }), bill({ id: 'new', date: '2026-10-20' })];

    expect(spendAtPlace(saved(), twice).map(entry => entry.expenseId)).toEqual(['new', 'old']);
  });
});

describe('spendSummary', () => {
  it('reads as money', () => {
    expect(spendSummary(spendAtPlace(saved(), [bill()]))).toBe('NT$ 882');
  });

  it('counts the visits when there was more than one', () => {
    const twice = [bill({ id: 'a', date: '2026-03-02', twdAmount: 574 }), bill({ id: 'b' })];

    expect(spendSummary(spendAtPlace(saved(), twice))).toBe('NT$ 1,456・2 筆');
  });

  it('is empty when nothing was spent there', () => {
    expect(spendSummary([])).toBe('');
  });
});
