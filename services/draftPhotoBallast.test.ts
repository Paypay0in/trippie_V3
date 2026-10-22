/**
 * @vitest-environment jsdom
 *
 * 「行程儲存失敗…這台裝置的儲存空間可能滿了」 — a stop could not be added to
 * tomorrow because of a receipt photographed last week.
 *
 * A photo on a synced trip is already on the server, and a read puts the
 * server's row back over the local one. So the local copy of a *confirmed*
 * photo is a cache. Confirmed is the whole of the safety: a photo taken five
 * minutes ago with no signal is never touched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withoutCloudHeldPhotos } from './draftPhotoBallast';
import { saveEverSeen } from './everSeenRemoteIds';
import { TripDraft } from './tripPersistence';

const draft = (expenses: Array<Record<string, unknown>>): TripDraft[] => ([{
  id: 'trip-1', name: '東京', expenses,
}] as unknown as TripDraft[]);

const bill = (id: string, photos?: string[]) => ({
  id, description: '黑船亭', twdAmount: 882,
  ...(photos ? { receiptPhotos: photos } : {}),
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('withoutCloudHeldPhotos', () => {
  it('drops the local copy of a photo the server has confirmed', () => {
    saveEverSeen('trip-1', { expenses: ['e1'] });

    const { drafts, dropped } = withoutCloudHeldPhotos(draft([bill('e1', ['a', 'b'])]));

    expect(dropped).toBe(2);
    expect(drafts[0].expenses?.[0]).not.toHaveProperty('receiptPhotos');
  });

  /* The one that must never be touched. */
  it('keeps a photo the server has not acknowledged', () => {
    saveEverSeen('trip-1', { expenses: ['e1'] });

    const { drafts, dropped } = withoutCloudHeldPhotos(draft([bill('e2', ['fresh'])]));

    expect(dropped).toBe(0);
    expect(drafts[0].expenses?.[0]).toHaveProperty('receiptPhotos');
  });

  /* A trip that has never synced has nothing confirmed, so nothing goes. */
  it('touches nothing on a trip that never synced', () => {
    const original = draft([bill('e1', ['a'])]);

    const { drafts, dropped } = withoutCloudHeldPhotos(original);

    expect(dropped).toBe(0);
    expect(drafts).toBe(original);
  });

  it('leaves the rest of the bill alone', () => {
    saveEverSeen('trip-1', { expenses: ['e1'] });

    const { drafts } = withoutCloudHeldPhotos(draft([bill('e1', ['a'])]));

    expect(drafts[0].expenses?.[0]).toMatchObject({ id: 'e1', description: '黑船亭', twdAmount: 882 });
  });

  it('says nothing was freed when there were no photos', () => {
    saveEverSeen('trip-1', { expenses: ['e1'] });

    expect(withoutCloudHeldPhotos(draft([bill('e1')])).dropped).toBe(0);
  });
});

/**
 * 「這照片好像不會存」 — a shopping list losing pictures it had nothing to do
 * with, because 旅程回顧 had just filled the same five megabytes with 淺草寺.
 */
describe('a stop\'s own photographs', () => {
  it('frees the ones the server has confirmed', () => {
    saveEverSeen('trip', { itinerary: ['i1'] });

    const { drafts, dropped } = withoutCloudHeldPhotos([
      {
        id: 'trip',
        expenses: [],
        itinerary: [{ id: 'i1', photos: ['a', 'b'] }, { id: 'i2', photos: ['c'] }],
      } as never,
    ]);

    expect(dropped).toBe(2);
    expect(drafts[0].itinerary?.[0].photos).toBeUndefined();
    // Never pushed, so never a cache: the only copy there is.
    expect(drafts[0].itinerary?.[1].photos).toEqual(['c']);
  });

  it('leaves a draft whose stops the server has never seen entirely alone', () => {
    saveEverSeen('fresh', {});

    const { drafts, dropped } = withoutCloudHeldPhotos([
      { id: 'fresh', expenses: [], itinerary: [{ id: 'i1', photos: ['a'] }] } as never,
    ]);

    expect(dropped).toBe(0);
    expect(drafts[0].itinerary?.[0].photos).toEqual(['a']);
  });
});

/* 「這照片好像不會存」 — and once the list syncs, its pictures are a cache too. */
describe('a product picture', () => {
  it('is freed once the list has reached the server', () => {
    saveEverSeen('trip', { shoppingList: ['s1'] });

    const { drafts, dropped } = withoutCloudHeldPhotos([
      {
        id: 'trip',
        expenses: [],
        shoppingList: [{ id: 's1', photo: 'bottle' }, { id: 's2', photo: 'tube' }],
      } as never,
    ]);

    expect(dropped).toBe(1);
    expect(drafts[0].shoppingList?.[0].photo).toBeUndefined();
    expect(drafts[0].shoppingList?.[1].photo).toBe('tube');
  });
});
