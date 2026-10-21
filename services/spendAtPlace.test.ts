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
  twdAmount: 882, amount: 4300, currency: 'JPY', exchangeRate: 0.205,
  category: '餐飲', phase: 'during', merchantPlaceId: PLACE,
  ...over,
} as Expense);

describe('spendAtPlace', () => {
  it('finds the bill recorded at that place', () => {
    expect(spendAtPlace(saved(), [bill()])).toEqual([{
      expenseId: 'e', date: '2026-10-20', description: '黑船亭 洋食料理', twdAmount: 882,
      amountOriginal: 4300, currency: 'JPY', exchangeRate: 0.205,
    }]);
  });

  it('carries the note and the receipt photo', () => {
    const [found] = spendAtPlace(saved(), [bill({
      note: '蘑菇義大利麵很好吃', receiptPhotos: ['data:image/jpeg;base64,xxx', 'second'],
    })]);

    expect(found).toMatchObject({ note: '蘑菇義大利麵很好吃', photo: 'data:image/jpeg;base64,xxx' });
  });

  /* 「還有實際的結帳細目！」 — carried through, never recomputed. */
  it('carries every photo, the printed lines and the money the till charged', () => {
    const [found] = spendAtPlace(saved(), [bill({
      receiptPhotos: ['one', 'two'],
      receiptItems: [{ name: 'ハヤシライス', quantity: 2, amount: 3000 }],
      merchant: 'KUROFUNE-TEI',
    })]);

    expect(found).toMatchObject({
      photos: ['one', 'two'],
      items: [{ name: 'ハヤシライス', quantity: 2, amount: 3000 }],
      amountOriginal: 4300,
      currency: 'JPY',
      merchant: 'KUROFUNE-TEI',
    });
  });

  it('leaves the detail fields off a bill that has none', () => {
    const [found] = spendAtPlace(saved(), [bill()]);

    expect(found.items).toBeUndefined();
    expect(found.photos).toBeUndefined();
  });

  /*
    「他有給地址跟店名…你應該是配對那個」. The till's own name, not the
    description: 「KUROFUNE-TEI」 is the same word as the saved 「Kurofunetei」
    once the hyphen and the case stop counting.
  */
  it('matches the name the till printed', () => {
    const receipt = bill({ merchantPlaceId: undefined, merchant: 'KUROFUNE-TEI' });

    expect(spendAtPlace(saved(), [receipt])).toHaveLength(1);
  });

  /*
    The description is a sentence somebody wrote, and routinely names the dish
    rather than the shop. It is never the thing matched on.
  */
  it('ignores a description that happens to read like the place', () => {
    const receipt = bill({ merchantPlaceId: undefined, merchant: undefined, description: 'Kurofunetei' });

    expect(spendAtPlace(saved(), [receipt])).toEqual([]);
  });

  it('ignores a till name too short to mean anything', () => {
    const receipt = bill({ merchantPlaceId: undefined, merchant: '店' });

    expect(spendAtPlace(saved({ placeName: '店' }), [receipt])).toEqual([]);
  });

  /*
    The street number is what identifies the building; the words around it are
    written differently by everybody, and full-width digits are the same
    numbers.
  */
  it('matches the same street number, however it is typed', () => {
    const here = saved({
      placeId: 'ChIJ-saved', placeName: '別的寫法',
      formattedAddress: '日本、〒110-0005 東京都台東区上野２丁目13−13',
    });
    const receipt = bill({
      merchantPlaceId: undefined, merchant: undefined,
      merchantAddress: '東京都台東区上野2-13-13キクヤビル4F',
    });

    expect(spendAtPlace(here, [receipt])).toHaveLength(1);
  });

  it('does not match a different building on the same street', () => {
    const here = saved({
      placeId: 'ChIJ-saved', placeName: '別的寫法',
      formattedAddress: '東京都台東区上野2-13-13',
    });
    const receipt = bill({
      merchantPlaceId: undefined, merchant: undefined,
      merchantAddress: '東京都台東区上野4-8-21',
    });

    expect(spendAtPlace(here, [receipt])).toEqual([]);
  });

  it('says nothing for a saved place with no id and no position', () => {
    expect(spendAtPlace(saved({ placeId: undefined }), [bill()])).toEqual([]);
  });

  /*
    Google hands back different place ids for the same venue often enough — a
    shop and the building it is in, a branch re-listed — that an id-only rule
    finds nothing on a perfectly good pair of records. Sixty metres apart in a
    city is the same door.
  */
  it('matches a bill standing in the same spot under another id', () => {
    const here = saved({ placeId: 'ChIJ-saved', latitude: 35.7108, longitude: 139.7753 });
    const receipt = bill({
      merchantPlaceId: 'ChIJ-different',
      merchantLatitude: 35.71082, merchantLongitude: 139.77534,
    });

    expect(spendAtPlace(here, [receipt])).toHaveLength(1);
  });

  it('does not reach the shop down the street', () => {
    const here = saved({ placeId: 'ChIJ-saved', latitude: 35.7108, longitude: 139.7753 });
    const receipt = bill({
      merchantPlaceId: 'ChIJ-different',
      // About 400 metres away.
      merchantLatitude: 35.7144, merchantLongitude: 139.7753,
    });

    expect(spendAtPlace(here, [receipt])).toEqual([]);
  });

  it('ignores a bill with no position at all', () => {
    const here = saved({ placeId: undefined, latitude: 35.7108, longitude: 139.7753 });

    expect(spendAtPlace(here, [bill({ merchantPlaceId: undefined })])).toEqual([]);
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
