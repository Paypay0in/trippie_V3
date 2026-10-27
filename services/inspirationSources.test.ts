/**
 * Every recommendation behind a place, not just the one that won.
 *
 * 「不能因為 place_id 相同，就強制合併或覆蓋來源」. Two people can recommend the
 * same café. Until now the fold picked one of them and the other was gone —
 * and recoverably only when they had each written a note, because a note
 * carries its own `sourceCreatorId` and a bare recommendation carries none.
 *
 * The three singular fields keep their existing selection rule exactly. These
 * tests hold both halves at once: the old answer must not change, and the
 * recommendation it did not pick must not disappear.
 */
import { describe, expect, it } from 'vitest';
import { mergeTripInspirations, sourcesOf, withoutSource } from './inspirationMerge';
import { SavedTravelInspiration } from '../types';

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration => ({
  id: 'a', savedByUserId: 'me', country: '日本', city: '東京',
  placeName: '藍瓶咖啡', placeId: 'ChIJblue',
  sourcePostId: 'post-ann', sourceSliceId: 'slice-ann', sourceCreatorId: 'ann',
  sourceNoteIds: [], savedAt: '2026-10-02T00:00:00.000Z', notes: [],
  ...over,
});

const fromBob = (over: Partial<SavedTravelInspiration> = {}) => saved({
  id: 'b', sourcePostId: 'post-bob', sourceSliceId: 'slice-bob', sourceCreatorId: 'bob',
  savedAt: '2026-10-05T00:00:00.000Z', ...over,
});

const creditsOf = (record: SavedTravelInspiration) =>
  sourcesOf(record).map(source => source.sourceCreatorId).sort();

describe('兩個人推薦同一個地點', () => {
  /*
    The defect. Neither wrote a note, so the only record of either person was
    the three singular fields — and the fold kept one set.
  */
  it('沒有人寫筆記時，兩個推薦人都留下來', () => {
    const [merged] = mergeTripInspirations([saved({})], [fromBob()]);

    expect(creditsOf(merged)).toEqual(['ann', 'bob']);
  });

  it('三個來源也都留下來', () => {
    const [merged] = mergeTripInspirations(
      [saved({})],
      [fromBob()],
      [saved({ id: 'c', sourcePostId: 'post-cho', sourceSliceId: 'slice-cho', sourceCreatorId: 'cho' })],
    );

    expect(creditsOf(merged)).toEqual(['ann', 'bob', 'cho']);
  });

  /*
    Reviewer CGR-20261026-001 Q3: two independent people must not collapse
    merely because they referenced the same post slice.

    No save path produces this today — every one of them credits the content's
    author, so the creator already follows from the id. The case is here
    because that is a property of the current paths rather than a rule, and
    the day it stops holding the loss is silent: the second recommendation
    would merge into the first and leave nothing behind.
  */
  it('同一個貼文片段、不同推薦人，兩個都留下來', () => {
    const [merged] = mergeTripInspirations(
      [saved({})],
      [saved({ id: 'b', sourceCreatorId: 'bob', savedAt: '2026-10-05T00:00:00.000Z' })],
    );

    expect(creditsOf(merged)).toEqual(['ann', 'bob']);
  });

  /* 同一個推薦被兩台裝置各存一次，不算兩個來源。 */
  it('重複收藏同一個推薦只算一個來源', () => {
    const [merged] = mergeTripInspirations(
      [saved({})],
      [saved({ id: 'a2', savedAt: '2026-10-09T00:00:00.000Z' })],
    );

    expect(sourcesOf(merged)).toHaveLength(1);
    expect(sourcesOf(merged)[0]?.firstSeenAt).toBe('2026-10-02T00:00:00.000Z');
  });
});

/**
 * The half that must not move.
 *
 * `pickAttribution` decides whose name the card shows, and this change does
 * not touch it. Every screen reading these three fields must read what it read
 * before — that is what lets this ship without touching a single component.
 */
describe('原本的三個欄位，語意一個字不變', () => {
  it('兩邊都是實際來源時，較早的那個仍然勝出', () => {
    const [merged] = mergeTripInspirations([saved({})], [fromBob()]);

    expect(merged.sourcePostId).toBe('post-ann');
    expect(merged.sourceSliceId).toBe('slice-ann');
    expect(merged.sourceCreatorId).toBe('ann');
  });

  /* 「manual:…」 是「沒有人推薦」，所以即使它較早，實際來源仍然勝出。 */
  it('自己打字加入的較早、別人推薦的較晚時，仍然由推薦者具名', () => {
    const mine = saved({
      id: 'm', sourcePostId: 'manual:x', sourceSliceId: 'manual:x', sourceCreatorId: 'me',
      savedAt: '2026-01-01T00:00:00.000Z',
    });
    const [merged] = mergeTripInspirations([mine], [fromBob()]);

    expect(merged.sourceCreatorId).toBe('bob');
  });

  it('兩邊都是自己加入的就維持原樣', () => {
    const mine = saved({ sourcePostId: 'manual:x', sourceSliceId: 'manual:x', sourceCreatorId: 'me' });
    const [merged] = mergeTripInspirations(
      [mine],
      [saved({ id: 'm2', sourcePostId: 'screenshot:y', sourceSliceId: 'screenshot:y', sourceCreatorId: 'me', savedAt: '2026-10-08T00:00:00.000Z' })],
    );

    expect(merged.sourceCreatorId).toBe('me');
    expect(merged.sourcePostId).toBe('manual:x');
  });
});

describe('沒有人推薦的地點', () => {
  /* 自己搜尋加入的地點不產生來源項，而且形狀不變。 */
  it('不產生任何來源', () => {
    const mine = saved({ sourcePostId: 'manual:x', sourceSliceId: 'manual:x', sourceCreatorId: 'me' });

    expect(sourcesOf(mine)).toEqual([]);
  });

  it('合併兩筆自己加入的也不長出 sources 欄位', () => {
    const mine = saved({ sourcePostId: 'manual:x', sourceSliceId: 'manual:x', sourceCreatorId: 'me' });
    const [merged] = mergeTripInspirations(
      [mine],
      [saved({ id: 'm2', sourcePostId: 'screenshot:y', sourceSliceId: 'screenshot:y', sourceCreatorId: 'me', savedAt: '2026-10-08T00:00:00.000Z' })],
    );

    expect('sources' in merged).toBe(false);
  });
});

describe('舊資料', () => {
  /* 沒有 sources 欄位的紀錄，讀出來就是它本來隱含的那一個來源。 */
  it('從既有三個欄位推導出一個來源', () => {
    expect(sourcesOf(saved({}))).toEqual([{
      sourceType: 'post',
      sourceId: 'post-ann',
      sourceItemId: 'slice-ann',
      sourceCreatorId: 'ann',
      firstSeenAt: '2026-10-02T00:00:00.000Z',
    }]);
  });

  it('舊資料和新資料合併時兩邊都算數', () => {
    const legacy = saved({});
    const withSources = fromBob({
      sources: [{ sourceType: 'post', sourceId: 'post-bob', sourceItemId: 'slice-bob', sourceCreatorId: 'bob' }],
    });
    const [merged] = mergeTripInspirations([legacy], [withSources]);

    expect(creditsOf(merged)).toEqual(['ann', 'bob']);
  });
});

/**
 * Removal is a thing the traveller asks for.
 *
 * The whole point of `sources` is that the program stops losing them by
 * accident — which must not turn into the program refusing to let go of one
 * on purpose.
 */
describe('明確取消一個來源', () => {
  const twoSources = () => mergeTripInspirations(
    [saved({ notes: [{ id: 'n1', sourceNoteId: 'n1', sourceSliceId: 'mine', sourcePostId: 'manual:me', sourceCreatorId: 'me', type: 'other', text: '自己寫的' }] })],
    [fromBob()],
  )[0] as SavedTravelInspiration;

  it('移除指定的那一個，其餘留著', () => {
    const left = withoutSource(twoSources(), {
      sourceType: 'post', sourceId: 'post-ann', sourceItemId: 'slice-ann', sourceCreatorId: 'ann',
    });

    expect(creditsOf(left)).toEqual(['bob']);
  });

  /* 取消來源不是刪筆記。筆記是這個人自己寫的，和誰推薦過這個地方無關。 */
  it('不動使用者自己的筆記', () => {
    const left = withoutSource(twoSources(), {
      sourceType: 'post', sourceId: 'post-ann', sourceItemId: 'slice-ann', sourceCreatorId: 'ann',
    });

    expect(left.notes.map(entry => entry.text)).toEqual(['自己寫的']);
  });

  it('取消最後一個來源仍然保留這筆收藏', () => {
    let record = twoSources();
    record = withoutSource(record, { sourceType: 'post', sourceId: 'post-ann', sourceItemId: 'slice-ann', sourceCreatorId: 'ann' });
    record = withoutSource(record, { sourceType: 'post', sourceId: 'post-bob', sourceItemId: 'slice-bob', sourceCreatorId: 'bob' });

    expect(record.placeName).toBe('藍瓶咖啡');
    expect(sourcesOf(record)).toEqual([]);
    expect(record.notes).toHaveLength(1);
  });

  /*
    取消之後再合併進同一個推薦，它會回來 —— 這是對的：那個推薦確實又出現了
    一次。這條測試存在是為了把行為寫下來，而不是讓它某天變成意外。
  */
  it('取消後若同一個推薦再次出現，會重新記錄', () => {
    const left = withoutSource(twoSources(), {
      sourceType: 'post', sourceId: 'post-ann', sourceItemId: 'slice-ann', sourceCreatorId: 'ann',
    });
    const [again] = mergeTripInspirations([left], [saved({ id: 'a3' })]);

    expect(creditsOf(again)).toEqual(['ann', 'bob']);
  });
});
