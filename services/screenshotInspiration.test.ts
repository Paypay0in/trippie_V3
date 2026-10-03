/**
 * 「跟朋友會先把想去的地方列一個表單 … 我感覺這個截圖上傳可以變成一個收藏的 list
 *   最後一鍵讓 AI 閱讀目前行程後 再根據收藏行程的地址去安排行程表排進去」.
 *
 * That list already exists. Saved Inspiration is the trip's collection of
 * places-to-maybe-go, and 補充行程 already reads the official itinerary and fits
 * selected places into it. A screenshot saves into the same store rather than a
 * second one beside it — the second list would be a second thing to pick from,
 * a second dedupe rule, and a second place for a plan to hide.
 */
import { describe, expect, it } from 'vitest';
import { isFromScreenshot, mergeScreenshotInspirations, slicesToSavedInspirations } from './screenshotInspiration';
import { ItinerarySlice } from './itineraryImageSlices';
import { SavedTravelInspiration } from '../types';

const slice = (over: Partial<ItinerarySlice>): ItinerarySlice => ({
  id: 'shot-0', type: 'food', title: '大師兄牛肉麵', notes: [], ...over,
});

let counter = 0;
const context = (over: Record<string, unknown> = {}) => ({
  savedByUserId: 'me',
  country: '韓國',
  city: '釜山',
  makeId: () => `id-${(counter += 1)}`,
  savedAt: '2026-10-02T00:00:00.000Z',
  ...over,
});

describe('截圖變成收藏', () => {
  it('帶著地址與座標存進去——AI 之後要靠地址安排', () => {
    const [saved] = slicesToSavedInspirations([slice({})], context({
      resolved: { 'shot-0': { placeId: 'ChIJx', address: '釜山市西面路 1 號', latitude: 35.15, longitude: 129.06 } },
    }));

    expect(saved.placeId).toBe('ChIJx');
    expect(saved.formattedAddress).toBe('釜山市西面路 1 號');
    expect(saved.latitude).toBe(35.15);
  });

  it('查不到地點時照樣收藏，只是沒有地圖身分', () => {
    const [saved] = slicesToSavedInspirations([slice({})], context());

    expect(saved.placeName).toBe('大師兄牛肉麵');
    expect(saved.placeId).toBeUndefined();
    expect(saved.resolvedPlaceName).toBeUndefined();
  });

  it('標成截圖來源，不會假裝是某篇社群貼文', () => {
    const [saved] = slicesToSavedInspirations([slice({})], context());

    expect(isFromScreenshot(saved)).toBe(true);
    expect(saved.sourceCreatorId).toBe('me');
  });

  it('筆記跟著地點一起收藏', () => {
    const [saved] = slicesToSavedInspirations(
      [slice({ notes: [{ text: '晚上七點後要排隊' }] })],
      context(),
    );

    expect(saved.notes.map(note => note.text)).toEqual(['晚上七點後要排隊']);
  });

  it('目的地的國家與城市從旅程來，截圖本身不會寫這個', () => {
    const [saved] = slicesToSavedInspirations([slice({})], context());

    expect(saved.country).toBe('韓國');
    expect(saved.city).toBe('釜山');
  });
});

describe('兩個朋友的清單有重複時', () => {
  const first = slicesToSavedInspirations([slice({ notes: [{ text: '要排隊' }] })], context())[0];

  it('同一個地點不會出現兩次', () => {
    const second = slicesToSavedInspirations([slice({ id: 'shot-9', notes: [] })], context())[0];

    expect(mergeScreenshotInspirations([first], [second])).toHaveLength(1);
  });

  it('第二份清單的筆記會補進同一個地點', () => {
    const second = slicesToSavedInspirations(
      [slice({ id: 'shot-9', notes: [{ text: '可以加麵' }] })],
      context(),
    )[0];

    const merged = mergeScreenshotInspirations([first], [second]);

    expect(merged[0].notes.map(note => note.text)).toEqual(['要排隊', '可以加麵']);
  });

  it('第二份清單查到地址時，補上原本缺的那一份', () => {
    const second = slicesToSavedInspirations([slice({ id: 'shot-9' })], context({
      resolved: { 'shot-9': { placeId: 'ChIJx', address: '釜山市西面路 1 號' } },
    }))[0];

    const merged = mergeScreenshotInspirations([first], [second]);

    expect(merged[0].placeId).toBe('ChIJx');
    expect(merged[0].formattedAddress).toBe('釜山市西面路 1 號');
  });

  it('不同的地點照常各自收藏', () => {
    const other = slicesToSavedInspirations([slice({ id: 'shot-2', title: '甘川洞文化村' })], context())[0];

    expect(mergeScreenshotInspirations([first], [other])).toHaveLength(2);
  });

  it('別人收藏的東西不會被合併進來', () => {
    const theirs: SavedTravelInspiration = { ...first, id: 'theirs', savedByUserId: 'gina' };

    expect(mergeScreenshotInspirations([theirs], [first])).toHaveLength(2);
  });
});

/**
 * 「已收藏的也要列重點」.
 *
 * The picker showed a list of restaurant names with nothing under them. A
 * SavedTravelInspiration carries a place and its notes and no free-text field,
 * so a slice whose content the model had put in `summary` reached the collection
 * stripped of everything that made it worth saving.
 */
describe('收藏時要把重點一起帶進去', () => {
  it('摘要也變成一條重點，而不是被丟掉', () => {
    const [saved] = slicesToSavedInspirations(
      [slice({ summary: '韓式創意料理餐廳', notes: [{ text: '招牌是大份量拌飯' }] })],
      context(),
    );

    expect(saved.notes.map(note => note.text)).toEqual(['韓式創意料理餐廳', '招牌是大份量拌飯']);
  });

  it('摘要排第一——它說的是「這是什麼」', () => {
    const [saved] = slicesToSavedInspirations(
      [slice({ summary: '雜貨店', notes: [{ text: '二樓賣創意小物' }] })],
      context(),
    );

    expect(saved.notes[0].text).toBe('雜貨店');
  });

  it('摘要和某條筆記一樣時不會變成兩條', () => {
    const [saved] = slicesToSavedInspirations(
      [slice({ summary: '雜貨店', notes: [{ text: '雜貨店' }, { text: '二樓賣創意小物' }] })],
      context(),
    );

    expect(saved.notes.map(note => note.text)).toEqual(['雜貨店', '二樓賣創意小物']);
  });

  it('什麼都沒有時就是沒有重點，不會硬生出一條', () => {
    const [saved] = slicesToSavedInspirations([slice({ summary: undefined, notes: [] })], context());

    expect(saved.notes).toEqual([]);
    expect(saved.sourceNoteIds).toEqual([]);
  });

  it('每條重點都查得到來源，重新載入時才不會被丟掉', () => {
    const [saved] = slicesToSavedInspirations(
      [slice({ summary: '雜貨店', notes: [{ text: '二樓賣創意小物' }] })],
      context(),
    );

    expect(saved.sourceNoteIds).toHaveLength(2);
    expect(saved.notes.every(note => note.sourcePostId.startsWith('screenshot:'))).toBe(true);
  });
});
