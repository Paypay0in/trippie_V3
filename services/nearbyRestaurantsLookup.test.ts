/**
 * 「或是 Ai 搜尋後推薦結果出現三個問用戶嗎」.
 *
 * Answered with Places rather than a language model: 「what restaurants are
 * near this point」 is a lookup. The payloads below are trimmed from the live
 * response for the 淺草 midpoint, asked on 2026-10-18.
 */
import { describe, expect, it } from 'vitest';
import { ENOUGH_RATINGS, LOOKING_FOR, readNearbyRestaurants, registerNearbyRestaurantsRoute } from './nearbyRestaurantsLookup';

const place = (over: Record<string, unknown>) => ({
  id: 'ChIJ-x', displayName: { text: '一蘭 淺草店' },
  primaryTypeDisplayName: { text: '拉麵店' },
  location: { latitude: 35.7108, longitude: 139.7955 },
  rating: 4.3, userRatingCount: 5535,
  ...over,
});

describe('readNearbyRestaurants', () => {
  it('reads the places Google returned', () => {
    const [first] = readNearbyRestaurants({ places: [place({})] });

    expect(first).toEqual({
      placeId: 'ChIJ-x', placeName: '一蘭 淺草店',
      latitude: 35.7108, longitude: 139.7955,
      kind: '拉麵店',
      rating: 4.3, ratingCount: 5535,
    });
  });

  /*
    Ranked by popularity the first page still carries places with three
    reviews. 「5.0 from three people」 is not a recommendation, and this is
    replacing somewhere chosen on purpose.
  */
  it('drops a place too few people have been to', () => {
    const results = readNearbyRestaurants({
      places: [place({ userRatingCount: ENOUGH_RATINGS - 1 }), place({ id: 'ChIJ-y' })],
    });

    expect(results.map(entry => entry.placeId)).toEqual(['ChIJ-y']);
  });

  /* A place with no id or no position cannot be offered or drawn. */
  it('drops anything it could not use', () => {
    expect(readNearbyRestaurants({
      places: [
        place({ id: '' }),
        place({ displayName: { text: '  ' } }),
        place({ location: undefined }),
      ],
    })).toEqual([]);
  });

  /* A rating is optional; a place without one is still a real place. */
  it('keeps a place that has no rating', () => {
    const [first] = readNearbyRestaurants({
      places: [place({ rating: undefined, userRatingCount: 120 })],
    });

    expect(first.rating).toBeUndefined();
    expect(first.ratingCount).toBe(120);
  });

  it('says nothing about an empty or broken answer', () => {
    expect(readNearbyRestaurants({})).toEqual([]);
    expect(readNearbyRestaurants(null)).toEqual([]);
    expect(readNearbyRestaurants({ places: null })).toEqual([]);
  });
});

/**
 * 「告訴我是哪類餐廳」. Measured against the live response for the 淺草 midpoint:
 * 一蘭 is 拉麵店, 淺草 炸牛 is 日式炸豬排餐廳, Sushiro is 壽司店.
 */
describe('what kind of restaurant it is', () => {
  it('reads the localized type Google returns', () => {
    expect(readNearbyRestaurants({
      places: [place({ primaryTypeDisplayName: { text: '日式炸豬排餐廳' } })],
    })[0].kind).toBe('日式炸豬排餐廳');
  });

  /* A place Google gave no type for keeps its name and claims nothing. */
  it('says nothing when Google did not', () => {
    expect(readNearbyRestaurants({
      places: [place({ primaryTypeDisplayName: undefined })],
    })[0].kind).toBeUndefined();
    expect(readNearbyRestaurants({
      places: [place({ primaryTypeDisplayName: { text: '   ' } })],
    })[0].kind).toBeUndefined();
  });
});

/**
 * 「若不是在編輯吃東西的時段時 推薦就不要是食物」.
 *
 * The 15:30 下午行程 block was offered three Korean restaurants: this route
 * only ever asked Google for restaurants, whatever the slot was for.
 */
describe('what the slot is asking for', () => {
  /** A stand-in Express, so the real handler is the thing under test. */
  const handlerFor = () => {
    let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
    const app = { post: (_path: string, fn: never) => { handler = fn; } } as never;
    const sent: unknown[] = [];
    const bodies: unknown[] = [];
    registerNearbyRestaurantsRoute(app, {
      googleApiKey: () => 'test-key',
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body || '{}')));
        return { ok: true, json: async () => ({ places: [] }) };
      }) as never,
    });
    return {
      call: (body: Record<string, unknown>) =>
        handler!({ body }, { json: (value: unknown) => { sent.push(value); } }),
      bodies,
      sent,
    };
  };

  const AT = { latitude: 35.1631, longitude: 129.1635 };

  it('asks for things to do when the block is not a meal', async () => {
    const route = handlerFor();

    await route.call({ ...AT, looking: 'activity' });

    expect((route.bodies[0] as { includedPrimaryTypes: string[] }).includedPrimaryTypes)
      .toContain('tourist_attraction');
    expect((route.bodies[0] as { includedPrimaryTypes: string[] }).includedPrimaryTypes)
      .not.toContain('restaurant');
  });

  it('still asks for restaurants at a mealtime', async () => {
    const route = handlerFor();

    await route.call({ ...AT, looking: 'food' });

    expect((route.bodies[0] as { includedPrimaryTypes: string[] }).includedPrimaryTypes)
      .toEqual(['restaurant']);
  });

  /* An older client sends no 「looking」, and food is where this started. */
  it('falls back to food when nothing was asked for', async () => {
    const route = handlerFor();

    await route.call(AT);

    expect((route.bodies[0] as { includedPrimaryTypes: string[] }).includedPrimaryTypes)
      .toEqual(['restaurant']);
  });

  /* Every type here has to be one Google knows, or the call errors and the
     offer silently disappears. */
  it('names only Google place types', () => {
    Object.values(LOOKING_FOR).flat().forEach(type => {
      expect(type).toMatch(/^[a-z_]+$/);
    });
  });
});

/**
 * 「這裡還需要：更多搜尋🔍」.
 *
 * Three places near a corner is an offer. Somebody who already knows what they
 * want was left with the three we chose and no way past them.
 */
describe('searching this corner by name', () => {
  const handlerFor = () => {
    let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
    const app = { post: (_path: string, fn: never) => { handler = fn; } } as never;
    const sent: unknown[] = [];
    const urls: string[] = [];
    const bodies: unknown[] = [];
    registerNearbyRestaurantsRoute(app, {
      googleApiKey: () => 'test-key',
      fetchImpl: (async (url: string, init?: RequestInit) => {
        urls.push(String(url));
        bodies.push(JSON.parse(String(init?.body || '{}')));
        return {
          ok: true,
          json: async () => ({ places: [place({ userRatingCount: 4, rating: 4.9 })] }),
        };
      }) as never,
    });
    return {
      call: (body: Record<string, unknown>) =>
        handler!({ body }, { json: (value: unknown) => { sent.push(value); } }),
      urls, bodies, sent,
    };
  };

  const AT = { latitude: 35.7108, longitude: 139.7955 };

  it('asks searchText rather than sweeping the category', async () => {
    const route = handlerFor();

    await route.call({ ...AT, query: '一蘭' });

    expect(route.urls[0]).toContain('places:searchText');
    expect((route.bodies[0] as { textQuery: string }).textQuery).toBe('一蘭');
  });

  /* A name is a request, so the place does not have to be well known. */
  it('keeps a place with four reviews when it was asked for by name', async () => {
    const route = handlerFor();

    await route.call({ ...AT, query: '一蘭' });

    expect((route.sent[0] as { restaurants: unknown[] }).restaurants).toHaveLength(1);
  });

  /* The same four-review place is noise when nobody asked for it. */
  it('still holds the bar for 「what is near here」', async () => {
    const route = handlerFor();

    await route.call(AT);

    expect(route.urls[0]).toContain('places:searchNearby');
    expect((route.sent[0] as { restaurants: unknown[] }).restaurants).toHaveLength(0);
  });

  /*
    Bias, not restriction: refusing the place somebody named because it is
    300m outside our circle is a worse answer than showing it.
  */
  it('biases to the corner instead of fencing it', async () => {
    const route = handlerFor();

    await route.call({ ...AT, query: '淺草 燒肉' });

    expect(route.bodies[0]).toHaveProperty('locationBias');
    expect(route.bodies[0]).not.toHaveProperty('locationRestriction');
  });

  it('ignores a query of spaces', async () => {
    const route = handlerFor();

    await route.call({ ...AT, query: '   ' });

    expect(route.urls[0]).toContain('places:searchNearby');
  });
});
