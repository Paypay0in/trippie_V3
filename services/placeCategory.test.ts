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
