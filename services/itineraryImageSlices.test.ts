/**
 * 「讓他讀取截圖中的旅行資訊，切片之後讓用戶可以加入行程」.
 *
 * A screenshot is read, never trusted. The model gets a picture and returns
 * names and notes; what it must not return — and what this refuses to carry
 * even if it does — is identity. A picture of the words 「甘川洞文化村」 is not a
 * Google place, and an address invented here would send somebody to a door
 * that was never there.
 */
import { describe, expect, it } from 'vitest';
import { normalizeItinerarySlices, sliceToItineraryItem } from './itineraryImageSlices';

const raw = {
  slices: [
    { type: 'food', title: '大師兄牛肉麵', placeName: '大師兄牛肉麵 西面店', notes: [{ text: '晚上七點後要排隊' }, { text: '' }] },
    { type: 'place', title: '甘川洞文化村', suggestedStartTime: '10:00', durationMinutes: 120, notes: [] },
    { type: 'tip', title: '交通卡', summary: 'T-money 在便利商店買得到', notes: [{ text: '地鐵公車都能刷' }] },
  ],
};

describe('讀出來的切片', () => {
  it('保留名稱、筆記與截圖寫明的時間', () => {
    const [noodles, village] = normalizeItinerarySlices(raw);

    expect(noodles.title).toBe('大師兄牛肉麵');
    expect(noodles.placeName).toBe('大師兄牛肉麵 西面店');
    expect(noodles.notes.map(note => note.text)).toEqual(['晚上七點後要排隊']);
    expect(village.suggestedStartTime).toBe('10:00');
    expect(village.durationMinutes).toBe(120);
  });

  it('沒有標題或類型不認得的就丟掉，不猜', () => {
    const messy = { slices: [{ type: 'food', title: '  ' }, { type: 'weather', title: '明天下雨' }, null, '字串'] };

    expect(normalizeItinerarySlices(messy)).toEqual([]);
  });

  it('同一張截圖裡重複的地點只留一個', () => {
    const repeated = { slices: [{ type: 'food', title: '豬肉湯飯' }, { type: 'food', title: '豬肉湯飯' }] };

    expect(normalizeItinerarySlices(repeated)).toHaveLength(1);
  });

  it('不是 HH:mm 的時間一律不採用', () => {
    const vague = { slices: [{ type: 'place', title: '海雲台', suggestedStartTime: '傍晚' }] };

    expect(normalizeItinerarySlices(vague)[0].suggestedStartTime).toBeUndefined();
  });

  it('回傳的東西壞掉時給空陣列，而不是爆掉', () => {
    expect(normalizeItinerarySlices(null)).toEqual([]);
    expect(normalizeItinerarySlices({})).toEqual([]);
    expect(normalizeItinerarySlices({ slices: '不是陣列' })).toEqual([]);
  });
});

describe('加進行程的卡片', () => {
  const slices = normalizeItinerarySlices(raw);
  const makeId = () => 'generated';

  it('帶著名稱與筆記，筆記逐條列出來', () => {
    const item = sliceToItineraryItem(slices[0], makeId, '2026-10-03');

    expect(item.title).toBe('大師兄牛肉麵');
    expect(item.date).toBe('2026-10-03');
    expect(item.notes).toContain('晚上七點後要排隊');
  });

  it('類型對應到行程卡片的類型', () => {
    expect(sliceToItineraryItem(slices[0], makeId).type).toBe('FOOD');
    expect(sliceToItineraryItem(slices[1], makeId).type).toBe('ACTIVITY');
  });

  it('絕對不帶 placeId 或座標——截圖上根本沒有那些東西', () => {
    const item = sliceToItineraryItem(slices[0], makeId, '2026-10-03');

    expect(item.placeId).toBeUndefined();
    expect(item.latitude).toBeUndefined();
    expect(item.longitude).toBeUndefined();
    expect(item.address).toBeUndefined();
  });

  it('沒選日期就不指定日期，不會自己塞一天', () => {
    expect(sliceToItineraryItem(slices[0], makeId).date).toBeUndefined();
  });

  it('截圖沒寫時間就留空，不發明一個小時', () => {
    expect(sliceToItineraryItem(slices[0], makeId).time).toBe('');
    expect(sliceToItineraryItem(slices[1], makeId).time).toBe('10:00');
  });

  it('不會被當成收藏靈感或 AI 建議——那是別的來源', () => {
    expect(sliceToItineraryItem(slices[0], makeId).origin).toBeUndefined();
    expect(sliceToItineraryItem(slices[0], makeId).sourceInspirationIds).toBeUndefined();
  });
});
