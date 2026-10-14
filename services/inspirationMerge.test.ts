/**
 * 「好啊 收藏可以同步 也要可以檢查是否重複」.
 *
 * Two people building a want-to-go list together will save the same place: the
 * same friend sent both of them the same screenshot, or one typed 「Panier」 and
 * the other 「panier」. Before the list synced, that was invisible — each phone
 * only ever saw its own.
 */
import { describe, expect, it } from 'vitest';
import { findDuplicateInspirations, inspirationKey, mergeTripInspirations } from './inspirationMerge';
import { SavedTravelInspiration } from '../types';

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration => ({
  id: 'a', savedByUserId: 'me', country: '韓國', city: '釜山',
  placeName: 'Panier', sourcePostId: 's', sourceSliceId: 's', sourceCreatorId: 'me',
  sourceNoteIds: [], savedAt: '2026-10-02T00:00:00.000Z', notes: [],
  ...over,
});

const note = (text: string) => ({
  id: `n-${text}`, sourceNoteId: `n-${text}`, sourceSliceId: 's', sourcePostId: 's',
  sourceCreatorId: 'me', type: 'other' as const, text,
});

describe('什麼算同一個地點', () => {
  it('有 Google 地點 id 就以它為準', () => {
    expect(inspirationKey(saved({ placeId: 'ChIJx' }))).toBe('place:ChIJx');
  });

  it('沒有 id 時用名稱，大小寫與前後空白不算差異', () => {
    expect(inspirationKey(saved({ placeName: '  Panier ' }))).toBe(inspirationKey(saved({ placeName: 'panier' })));
  });
});

describe('兩支手機的清單合併', () => {
  const mine = saved({ id: 'mine', placeName: 'Panier', notes: [note('週一公休')] });
  const hers = saved({
    id: 'hers', savedByUserId: 'gina', placeName: 'panier',
    placeId: 'ChIJpanier', formattedAddress: '釜山市釜山鎮區',
    savedAt: '2026-10-02T05:00:00.000Z', notes: [note('有賣貼紙')],
  });

  it('同一個地點只留一筆', () => {
    expect(mergeTripInspirations([mine], [hers])).toHaveLength(1);
  });

  it('兩個人的筆記都保留——沒有人寫的東西因為別人也收藏就不見', () => {
    expect(mergeTripInspirations([mine], [hers])[0].notes.map(entry => entry.text))
      .toEqual(['週一公休', '有賣貼紙']);
  });

  it('其中一邊查到的地址會補上去', () => {
    const merged = mergeTripInspirations([mine], [hers])[0];

    expect(merged.placeId).toBe('ChIJpanier');
    expect(merged.formattedAddress).toBe('釜山市釜山鎮區');
  });

  it('先收藏的那一筆活下來——誰先找到的就是誰的', () => {
    expect(mergeTripInspirations([mine], [hers])[0].id).toBe('mine');
    expect(mergeTripInspirations([hers], [mine])[0].id).toBe('mine');
  });

  it('不同地點照常各自保留，順序照第一次出現', () => {
    const other = saved({ id: 'other', placeName: '甘川洞文化村' });

    expect(mergeTripInspirations([mine], [other, hers]).map(entry => entry.placeName))
      .toEqual(['Panier', '甘川洞文化村']);
  });

  it('兩邊都有 id 但不同家店時不會被合併', () => {
    const different = saved({ id: 'x', placeName: 'Panier', placeId: 'ChIJother' });
    const withId = saved({ id: 'y', placeName: 'Panier', placeId: 'ChIJpanier' });

    expect(mergeTripInspirations([withId], [different])).toHaveLength(2);
  });

  it('沒有名字的資料不會被收進來', () => {
    expect(mergeTripInspirations([saved({ placeName: '   ' })], [])).toEqual([]);
  });

  it('重複合併同一份清單不會變多', () => {
    const once = mergeTripInspirations([mine], [hers]);

    expect(mergeTripInspirations(once, once)).toHaveLength(1);
  });
});

describe('已經重複的清單', () => {
  it('可以列出哪些是同一個地點', () => {
    const groups = findDuplicateInspirations([
      saved({ id: '1', placeName: 'Panier' }),
      saved({ id: '2', placeName: 'panier' }),
      saved({ id: '3', placeName: '甘川洞文化村' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].map(entry => entry.id)).toEqual(['1', '2']);
  });

  it('沒有重複時回傳空的', () => {
    expect(findDuplicateInspirations([saved({ id: '1' }), saved({ id: '2', placeName: '甘川洞' })])).toEqual([]);
  });
});

/**
 * 「有出現 但又消失了 沒有穩定存在」.
 *
 * This merge spreads the first record and then lifts a fixed list of fields off
 * the second. Every field added to the record since it was written — the 🏷️
 * tag, the ward, the lookup stamp — was being dropped, so whatever the second
 * copy knew was lost the moment the two devices' lists folded together.
 */
describe('合併時不能把後來才加的欄位丟掉', () => {
  const pair = (first: Partial<SavedTravelInspiration>, second: Partial<SavedTravelInspiration>) =>
    mergeTripInspirations(
      [saved({ id: 'a', placeId: 'ChIJx', ...first })],
      [saved({ id: 'b', placeId: 'ChIJx', ...second })],
    )[0];

  it('保留另一份知道的標籤、行政區與查詢時間', () => {
    const merged = pair({}, {
      category: 'food',
      district: 'Haeundae',
      placeResolvedAt: '2026-10-14T10:00:00.000Z',
    });

    expect(merged.category).toBe('food');
    expect(merged.district).toBe('Haeundae');
    expect(merged.placeResolvedAt).toBe('2026-10-14T10:00:00.000Z');
  });

  /* 「other」 is 「asked, and there was no answer」 — a real tag beats it. */
  it('真的分類贏過 other，不論哪一份先讀到', () => {
    expect(pair({ category: 'other' }, { category: 'food' }).category).toBe('food');
    expect(pair({ category: 'food' }, { category: 'other' }).category).toBe('food');
  });

  /* And 「other」 still survives when it is all either copy has, so the backfill
     does not start offering the place again. */
  it('兩份都只有 other 時仍然保留 other', () => {
    expect(pair({ category: 'other' }, { category: 'other' }).category).toBe('other');
  });
});
