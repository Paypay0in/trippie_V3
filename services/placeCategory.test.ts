/**
 * 「每個收藏給個標籤🏷️景點、餐廳、等等」.
 *
 * The cases are his own collection, as photographed: 「義大利餐廳」, 「藝術表演場館」,
 * 「拉麵店」 — three places that were each carrying a different word for what
 * amounts to two tags.
 */
import { describe, expect, it } from 'vitest';
import { placeCategory, placeCategoryLabel } from './placeCategory';

describe('the tag on a saved place', () => {
  /* The enum is the same in every language; prefer it. */
  it('reads Google\'s type rather than its prose', () => {
    expect(placeCategory({ primaryType: 'italian_restaurant' })).toBe('food');
    expect(placeCategory({ primaryType: 'performing_arts_theater' })).toBe('sight');
    expect(placeCategory({ primaryType: 'subway_station' })).toBe('transport');
  });

  /*
    Records resolved before `primaryType` was asked for still carry the
    localized text, so they are not left blank until somebody re-runs 補齊.
  */
  it('falls back to the localized text for older records', () => {
    expect(placeCategory({ kind: '義大利餐廳' })).toBe('food');
    expect(placeCategory({ kind: '藝術表演場館' })).toBe('sight');
    expect(placeCategory({ kind: '咖啡廳' })).toBe('cafe');
    expect(placeCategory({ kind: '韓式料理' })).toBe('food');
  });

  /*
    「咖啡」 before 「餐廳」: a 「咖啡餐廳」 is a café, and reversing the order would
    make every café a restaurant.
  */
  it('reads a café as a café when the text says both', () => {
    expect(placeCategory({ kind: '咖啡餐廳' })).toBe('cafe');
  });

  /* The screenshot already classified it, and that came from the traveller. */
  it('trusts the screenshot slice over a lookup', () => {
    expect(placeCategory({ sliceType: 'food', primaryType: 'tourist_attraction' })).toBe('food');
    expect(placeCategory({ sliceType: 'hotel' })).toBe('stay');
  });

  /* 「提醒」 is not a place; it has nothing to tag. */
  it('lets a tip fall through to the lookup', () => {
    expect(placeCategory({ sliceType: 'tip', primaryType: 'museum' })).toBe('sight');
  });

  /*
    An unmapped type is a gap in the table, not a fact about the place — so it
    falls through to the text rather than being pinned to 「其他」.
  */
  it('tries the text when the type is not in the table', () => {
    expect(placeCategory({ primaryType: 'izakaya_restaurant', kind: '居酒屋' })).toBe('food');
  });

  it('knows nothing from nothing', () => {
    expect(placeCategory({})).toBe('other');
    expect(placeCategory({ kind: '地標' })).toBe('other');
  });
});

/*
  A tag reading 「其他」 beside a place name costs a line and settles nothing.
*/
describe('what gets printed', () => {
  it('prints the tag it knows', () => {
    expect(placeCategoryLabel({ primaryType: 'ramen_restaurant' })).toBe('餐廳');
    expect(placeCategoryLabel({ primaryType: 'museum' })).toBe('景點');
  });

  it('prints nothing rather than 「其他」', () => {
    expect(placeCategoryLabel({})).toBe('');
  });
});

/**
 * 「這不是景點嗎」.
 *
 * 東京都現代美術館 resolved to `art_museum` — measured against the live route —
 * and the table held `museum` and `art_gallery` but not that one, so the card
 * printed 「Art museum · ★ 4.4（4,425）」 with no tag beside it.
 *
 * Listing every combination Google composes is the list nobody finishes. The
 * parts are matched instead.
 */
describe('types the table does not name', () => {
  /* Measured from the live resolve route against his own collection. */
  it('reads a composed type by its parts', () => {
    expect(placeCategory({ primaryType: 'art_museum' })).toBe('sight');
    expect(placeCategory({ primaryType: 'wholesale_market' })).toBe('shop');
    expect(placeCategory({ primaryType: 'vegan_restaurant' })).toBe('food');
    expect(placeCategory({ primaryType: 'cat_cafe' })).toBe('cafe');
  });

  /*
    The order is the whole correctness argument: 「coffee_shop」 contains 「shop」,
    so the café stems must be read before the shop ones.
  */
  it('reads a coffee shop as a café, not a shop', () => {
    expect(placeCategory({ primaryType: 'coffee_shop' })).toBe('cafe');
    expect(placeCategory({ primaryType: 'tea_house' })).toBe('cafe');
  });

  /* These all came back from the live route for places he has saved. */
  it('still reads the ones the table does name', () => {
    expect(placeCategory({ primaryType: 'performing_arts_theater' })).toBe('sight');
    expect(placeCategory({ primaryType: 'transit_station' })).toBe('transport');
    expect(placeCategory({ primaryType: 'bakery' })).toBe('cafe');
    expect(placeCategory({ primaryType: 'market' })).toBe('shop');
  });

  /* A type with no part this app knows is still an honest blank. */
  it('says nothing for a type it cannot read', () => {
    expect(placeCategory({ primaryType: 'dentist' })).toBe('other');
  });
});
