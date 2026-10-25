import { describe, expect, it } from 'vitest';
import { spendAtPlace, spendSentence, spendSummary } from './spendAtPlace';
import { Category, Expense, SavedTravelInspiration } from '../types';

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
    A description is a sentence somebody wrote and is routinely the dish
    rather than the shop, so it never beats anything — it is only read when
    there is nothing printed, and it still has to name the place.
  */
  it('ignores a description that names the dish', () => {
    const receipt = bill({
      merchantPlaceId: undefined, merchant: undefined, description: '蘑菇義大利麵',
    });

    expect(spendAtPlace(saved(), [receipt])).toEqual([]);
  });

  /*
    「這個本來不是可以 match 收藏清單了嗎」 — 八十八淺草抹茶🍵, typed by hand with
    no receipt. The description is the only name such a bill has, and it is
    the name the traveller chose for the place they went to.
  */
  it('matches a typed bill on what the traveller called it', () => {
    const here = saved({ placeId: 'ChIJ-hachi', placeName: '八十八淺草' });
    const receipt = bill({
      merchantPlaceId: undefined, merchant: undefined,
      description: '八十八淺草抹茶',
    });

    expect(spendAtPlace(here, [receipt])).toHaveLength(1);
  });

  /* The exclusion holds exactly where its reason holds. */
  it('still ignores the description when the till printed a name', () => {
    const here = saved({ placeId: 'ChIJ-hachi', placeName: '八十八淺草' });
    const receipt = bill({
      merchantPlaceId: undefined,
      merchant: 'LAWSON STORE',
      description: '八十八淺草抹茶',
    });

    expect(spendAtPlace(here, [receipt])).toEqual([]);
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

/**
 * 「這個可以連結到分帳的紀錄嗎。因為這個餐廳是朋友結帳」.
 *
 * It could, and once linked the card said 「你在這裡花過 NT$965」 off the
 * whole bill. He spent none of it. He owes part of it. Those are different
 * sentences and the card was telling the wrong one.
 */
describe('誰結的帳', () => {
  const ME = 'me';
  const FRIEND = 'sherry';
  const sushi = (over: Partial<Expense> = {}): Expense => ({
    id: 'e1', description: '壽司', amount: 4000, twdAmount: 965, currency: 'JPY',
    exchangeRate: 0.24, category: Category.FOOD, phase: 'during', date: '2026-10-22',
    payerId: FRIEND, beneficiaries: [ME, FRIEND], splitMethod: 'EQUAL',
    splitAllocations: {}, merchantPlaceId: 'g-sushi', ...over,
  } as Expense);

  const here = { placeId: 'g-sushi', placeName: 'Sushi no Wa' };

  it('carries who paid and what the reader owes', () => {
    const [entry] = spendAtPlace(here, [sushi()], ME);

    expect(entry.payerId).toBe(FRIEND);
    expect(entry.yourShare).toBe(483);
  });

  /* 0 is a claim that they owe nothing; absence is not that claim. */
  it('says nothing about a share the split did not name', () => {
    const [entry] = spendAtPlace(here, [sushi({ beneficiaries: [FRIEND] })], ME);

    expect(entry).not.toHaveProperty('yourShare');
  });

  it('keeps 你在這裡花過 for a bill the reader paid', () => {
    const sentence = spendSentence(spendAtPlace(here, [sushi({ payerId: ME })], ME), ME);

    expect(sentence?.lead).toBe('你在這裡花過');
    expect(sentence?.detail).toBeUndefined();
  });

  it('names the payer and the share when somebody else paid', () => {
    const sentence = spendSentence(
      spendAtPlace(here, [sushi()], ME),
      ME,
      id => (id === FRIEND ? 'Sherry' : undefined),
    );

    expect(sentence?.lead).toBe('這裡消費');
    expect(sentence?.total).toBe('NT$ 965');
    expect(sentence?.detail).toBe('Sherry 先付・你分攤 NT$ 483');
  });

  /* A name nobody can resolve is 「別人」, never a guess. */
  it('says 別人先付 when the payer has no name here', () => {
    const sentence = spendSentence(spendAtPlace(here, [sushi()], ME), ME);

    expect(sentence?.detail).toContain('別人先付');
  });

  /*
    A caller that does not know who is reading gets what it always got,
    rather than a sentence claiming whose money it was.
  */
  it('falls back to the old sentence when nobody said who is reading', () => {
    expect(spendSentence(spendAtPlace(here, [sushi()]))?.lead).toBe('你在這裡花過');
  });
});
