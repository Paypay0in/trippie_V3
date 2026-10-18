/**
 * 「拉麵店為何還是顯示為一區」, 「日本・日本」, and a whole country of notes under one
 * card — one gap, three symptoms.
 *
 * Those places were saved before the save path looked anything up, so they
 * carry a name and nothing else: no address to read a district out of, and no
 * city to group by.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { cityLooksLikeDistrict, knowsWhereItIs, placesNeedingBackfill } from './inspirationBackfill';
import { SavedTravelInspiration } from '../types';
import { CATEGORY_RULES } from './placeCategory';

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'i1',
  savedByUserId: 'me',
  placeName: 'らぁ麺や 嶋',
  country: '日本',
  city: '日本',
  notes: [],
  ...over,
} as SavedTravelInspiration);

describe('whether a saved place knows where it is', () => {
  it('knows when it has an address and a real city', () => {
    expect(knowsWhereItIs(saved({ formattedAddress: '東京都渋谷区本町3-41-11', city: 'Shibuya' }))).toBe(true);
  });

  /** The exact shape the old save path produced. */
  it('does not count a city that is its own country', () => {
    expect(knowsWhereItIs(saved({ formattedAddress: '東京都…', city: '日本' }))).toBe(false);
  });

  it('does not count a missing address', () => {
    expect(knowsWhereItIs(saved({ city: 'Shibuya' }))).toBe(false);
  });

  it('ignores case and spacing on that comparison', () => {
    expect(knowsWhereItIs(saved({ formattedAddress: 'x', country: 'Japan', city: ' japan ' }))).toBe(false);
  });
});

describe('what to look up', () => {
  it('lists only the ones still missing something', () => {
    const gaps = placesNeedingBackfill([
      saved({ id: 'a', placeName: '嶋' }),
      // A real city, not a ward — 「Taito City」 is Tokyo's 台東区 and is itself
      // a save that still needs correcting. See `cityLooksLikeDistrict`.
      // Stamped, because a record that has never been resolved is offered
      // whatever its city looks like. See `resolvedSinceTheSplit`.
      saved({ id: 'b', placeName: 'HARRY', formattedAddress: '…', city: 'Tokyo', placeResolvedAt: '2026-10-14T10:00:00.000Z', category: 'sight', categoryRules: CATEGORY_RULES }),
    ]);

    expect(gaps.map(gap => gap.placeName)).toEqual(['嶋']);
  });

  /** Two rows for one restaurant must not spend two requests. */
  it('groups rows of the same place into one lookup', () => {
    const gaps = placesNeedingBackfill([
      saved({ id: 'a', placeName: '嶋' }),
      saved({ id: 'b', placeName: '嶋' }),
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0].inspirationIds.sort()).toEqual(['a', 'b']);
  });

  /** Nothing to search for. */
  it('skips a save with no name at all', () => {
    expect(placesNeedingBackfill([saved({ placeName: '   ' })])).toHaveLength(0);
  });

  it('says nothing when every save already knows', () => {
    expect(placesNeedingBackfill([
      saved({ formattedAddress: '…', city: 'Tokyo', placeResolvedAt: '2026-10-14T10:00:00.000Z', category: 'sight', categoryRules: CATEGORY_RULES }),
    ])).toHaveLength(0);
  });
});

/**
 * 「這個即使我點選補齊 但若找不到 我要去哪點入搜尋？」
 *
 * A save with a place id but no address is not 「missing place identity」, so
 * the row offered no search — while the backfill listed it, failed on it, and
 * told the traveller to go and search for it by hand.
 */
describe('a place that has an id but still does not know where it is', () => {
  it('is listed for backfill', () => {
    const gaps = placesNeedingBackfill([
      saved({ placeId: 'p1', latitude: 35.68, longitude: 139.68 }),
    ]);

    expect(gaps).toHaveLength(1);
  });

  /* The predicate the row now asks, in the shape a group carries. */
  it('answers the same question for a group shape', () => {
    expect(knowsWhereItIs({ formattedAddress: '東京都渋谷区…', city: 'Shibuya', country: '日本' })).toBe(true);
    expect(knowsWhereItIs({ city: '日本', country: '日本' })).toBe(false);
    expect(knowsWhereItIs({ formattedAddress: '東京都…', city: '日本', country: '日本' })).toBe(false);
  });

  it('is offered the search on the row', () => {
    const planner = readFileSync(resolve(__dirname, '../components/TripInspirationPlanner.tsx'), 'utf8');

    expect(planner).toContain('group.missingPlaceIdentity || !knowsWhereItIs(group)');
  });
});

/**
 * 「這個是韓國釜山 不是加拿大」.
 *
 * The backfill searched with the *open trip's* country, so a Busan note looked
 * at while a Japan trip was open was asked for in the wrong country — and an
 * English restaurant name found a real place of that name on the other side of
 * the world. The save has said which country it is in since the day it was
 * saved; the trip on screen is a coincidence.
 */
describe('which country a save is searched in', () => {
  it('carries the save s own country', () => {
    const [gap] = placesNeedingBackfill([
      saved({ placeName: 'Working holiday', country: '韓國', city: '韓國' }),
    ]);

    expect(gap.country).toBe('韓國');
  });

  it('carries nothing when the save never said', () => {
    const [gap] = placesNeedingBackfill([saved({ placeName: 'x', country: '' })]);

    expect(gap.country).toBeUndefined();
  });

  /** Two rows of one place: the first that names a country settles it. */
  it('keeps a country when only one row has it', () => {
    const [gap] = placesNeedingBackfill([
      saved({ id: 'a', placeName: '嶋', country: '' }),
      saved({ id: 'b', placeName: '嶋', country: '日本' }),
    ]);

    expect(gap.country).toBe('日本');
  });

  it('is what the lookup is given, with the trip only as a fallback', () => {
    const planner = readFileSync(resolve(__dirname, '../components/TripInspirationPlanner.tsx'), 'utf8');

    // The query now carries the ward too; the country argument is unchanged.
    expect(planner).toContain('resolvePlace(query, gap.country || tripFallbackCountry)');
  });
});

/**
 * 「還是雙語」 — 「韓國・Suyeong-gu」.
 *
 * Those saves were written before the city and the ward were separated, so
 * their city field holds the ward and they look settled to a check that only
 * asks 「is there a city?」. Measured: Busan addresses carry no `locality` at
 * all — 「Busan」 is the region, 「Suyeong-gu」 the sublocality — so that value
 * could only have come from the ward.
 */
describe('a ward sitting in the city field', () => {
  it('is spotted by its suffix', () => {
    expect(cityLooksLikeDistrict({ city: 'Suyeong-gu', country: '韓國' })).toBe(true);
    expect(cityLooksLikeDistrict({ city: 'Shibuya-ku', country: '日本' })).toBe(true);
    expect(cityLooksLikeDistrict({ city: '台東区', country: '日本' })).toBe(true);
    expect(cityLooksLikeDistrict({ city: 'Chuo Ward', country: '日本' })).toBe(true);
  });

  /*
    「○○ City」 only counts in Japan, where Google writes a bare 「Osaka」 and
    「Sapporo」 for real cities and reserves the suffix for Tokyo's wards.
  */
  it('reads 「City」 as a ward only in Japan', () => {
    expect(cityLooksLikeDistrict({ city: 'Taito City', country: '日本' })).toBe(true);
    expect(cityLooksLikeDistrict({ city: 'Ho Chi Minh City', country: '越南' })).toBe(false);
  });

  it('leaves a real city alone', () => {
    expect(cityLooksLikeDistrict({ city: 'Busan', country: '韓國' })).toBe(false);
    expect(cityLooksLikeDistrict({ city: 'Tokyo', country: '日本' })).toBe(false);
    expect(cityLooksLikeDistrict({ city: '釜山', country: '韓國' })).toBe(false);
  });

  /** A save that already knows both is not one of these. */
  it('is not triggered once the ward has its own field', () => {
    expect(cityLooksLikeDistrict({ city: 'Taito City', country: '日本', district: 'Taito City' })).toBe(false);
  });

  it('is offered for backfill so it can be corrected', () => {
    const gaps = placesNeedingBackfill([
      saved({ placeName: 'Nasari Sigdang', country: '韓國', city: 'Suyeong-gu', formattedAddress: '釜山…' }),
    ]);

    expect(gaps).toHaveLength(1);
  });
});

/**
 * 「目前的結果 放到海雲台 釜山是空的」.
 *
 * 「Haeundae」 is a ward with no suffix to spot it by, and neither will the next
 * one have. Which records have been through the current lookup is a fact;
 * which cities are secretly wards is a guess that cannot be finished.
 */
describe('records that predate the city and ward split', () => {
  it('are offered even when their city looks perfectly fine', () => {
    const gaps = placesNeedingBackfill([
      saved({ placeName: '味贊王鹽烤肉', country: '韓國', city: 'Haeundae', formattedAddress: '釜山…' }),
    ]);

    expect(gaps).toHaveLength(1);
  });

  it('are left alone once they carry the stamp', () => {
    expect(placesNeedingBackfill([
      saved({
        placeName: '味贊王鹽烤肉', country: '韓國', city: 'Busan',
        district: 'Haeundae', formattedAddress: '釜山…',
        placeResolvedAt: '2026-10-14T10:00:00.000Z',
        category: 'sight',
        categoryRules: CATEGORY_RULES,
      }),
    ])).toHaveLength(0);
  });

  /* A place that genuinely has no ward is corrected once, not forever. */
  it('are left alone when the lookup found no ward', () => {
    expect(placesNeedingBackfill([
      saved({
        placeName: '海雲台海水浴場', country: '韓國', city: 'Busan',
        formattedAddress: '釜山…', placeResolvedAt: '2026-10-14T10:00:00.000Z', category: 'sight', categoryRules: CATEGORY_RULES,
      }),
    ])).toHaveLength(0);
  });

  /* Moved out of App.tsx into `applyResolvedPlace`, where it is now tested. */
  it('is stamped wherever resolved data is written', () => {
    const writer = readFileSync(resolve(__dirname, './applyResolvedPlace.ts'), 'utf8');

    expect(writer).toContain('placeResolvedAt: new Date().toISOString()');
  });
});

/**
 * 「這不是在海雲台嗎 要放在釜山吧？」
 *
 * Measured against the live route:
 *
 *   「Photowave」            → Place could not be resolved
 *   「Photowave Haeundae」   → 포토웨이브, 부산시, Haeundae
 *
 * A shop name alone is often not enough, and the record has been carrying the
 * answer all along.
 */
describe('what the lookup is asked for', () => {
  it('adds the ward the save already knows', () => {
    const [gap] = placesNeedingBackfill([
      saved({ placeName: 'Photowave', country: '韓國', city: '韓國', district: 'Haeundae' }),
    ]);

    expect(gap.near).toBe('Haeundae');
  });

  /** The ward is narrower than the city, so it is preferred. */
  it('prefers the ward over the city', () => {
    const [gap] = placesNeedingBackfill([
      saved({ placeName: 'x', country: '韓國', city: 'Busan', district: 'Haeundae' }),
    ]);

    expect(gap.near).toBe('Haeundae');
  });

  it('falls back to a real city', () => {
    const [gap] = placesNeedingBackfill([
      saved({ placeName: 'x', country: '韓國', city: 'Busan' }),
    ]);

    expect(gap.near).toBe('Busan');
  });

  /* A city equal to the country is the shape this repair exists to undo. */
  it('does not use a city that is just the country again', () => {
    const [gap] = placesNeedingBackfill([
      saved({ placeName: 'x', country: '韓國', city: '韓國' }),
    ]);

    expect(gap.near).toBeUndefined();
  });

  it('is joined onto the query', () => {
    const planner = readFileSync(resolve(__dirname, '../components/TripInspirationPlanner.tsx'), 'utf8');

    expect(planner).toContain("[gap.placeName, gap.near].filter(Boolean).join(' ')");
  });
});

/**
 * 「沒有補標籤」 and 「都可以」.
 *
 * The 🏷️ tag arrives with `primaryType`, which only a lookup fetches — so
 * records resolved before tags existed carry none, and nothing was going to
 * offer them again: they already know where they are and already carry the
 * stamp. Rather than a second button, the one repair the traveller already
 * knows about picks them up.
 */
describe('records settled before the tag existed', () => {
  const settled = {
    formattedAddress: '東京都渋谷区…',
    city: 'Tokyo',
    district: 'Shibuya',
    placeResolvedAt: '2026-10-14T10:00:00.000Z',
  };

  it('are offered again, because nothing else would reach them', () => {
    expect(placesNeedingBackfill([saved({ ...settled })]).map(gap => gap.id))
      .toEqual(['らぁ麺や 嶋']);
  });

  /*
    Terminating by construction: the resolve writes 「other」 when Google says
    nothing, so a place with no category of its own is settled by one pass
    rather than offered forever.
  */
  it('are left alone once they carry a tag, even 「other」', () => {
    expect(placesNeedingBackfill([saved({ ...settled, category: 'other', categoryRules: CATEGORY_RULES })])).toEqual([]);
    expect(placesNeedingBackfill([saved({ ...settled, category: 'food', categoryRules: CATEGORY_RULES })])).toEqual([]);
  });
});

/**
 * 「這也是景點？」.
 *
 * 豪德寺 is `buddhist_temple`, which the current rules read correctly. It was
 * asked an hour earlier, under rules that held neither that type nor any
 * stems, and settled as 「other」 — which means 「asked, and there was no
 * answer」, and is exactly what stops the backfill asking again. Correct on its
 * own terms, and it froze the wrong answer in place.
 */
describe('a record read by rules that have since improved', () => {
  const settled = {
    formattedAddress: '東京都世田谷区…',
    city: 'Tokyo',
    district: 'Setagaya',
    placeResolvedAt: '2026-10-14T10:00:00.000Z',
  };

  it('is asked again when the rules that answered it are out of date', () => {
    const stale = saved({ ...settled, category: 'other', categoryRules: 1 });

    expect(placesNeedingBackfill([stale])).toHaveLength(1);
  });

  it('is left alone once the current rules have answered it', () => {
    const fresh = saved({ ...settled, category: 'other', categoryRules: CATEGORY_RULES });

    expect(placesNeedingBackfill([fresh])).toEqual([]);
  });

  /* A record that never recorded which rules read it predates all of them. */
  it('is asked again when it never said which rules read it', () => {
    expect(placesNeedingBackfill([saved({ ...settled, category: 'sight' })])).toHaveLength(1);
  });
});
