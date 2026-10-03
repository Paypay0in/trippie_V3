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

  /**
   * 「透析完筆記，要根據各推薦抓重點，之後建立行程時也要顯示筆記」.
   *
   * The card has a 旅行筆記 section that lists notes one per line. Flattening
   * them into the free-text field meant the one thing worth reading while
   * standing outside the shop arrived as a paragraph.
   */
  it('筆記變成卡片上的旅行筆記，一條一條，而不是壓成一段文字', () => {
    const item = sliceToItineraryItem(slices[0], makeId, '2026-10-03');

    expect(item.title).toBe('大師兄牛肉麵');
    expect(item.date).toBe('2026-10-03');
    expect(item.savedTravelNotes?.map(note => note.text)).toEqual(['晚上七點後要排隊']);
  });

  it('筆記留得住——沒有來源連結的項目，重新載入時筆記會被丟掉', () => {
    const item = sliceToItineraryItem(slices[0], makeId);

    // tripPersistence drops savedTravelNotes when sourceInspirationIds is empty.
    expect(item.sourceInspirationIds?.length).toBeGreaterThan(0);
  });

  it('沒有筆記的切片不會硬掛一個空來源', () => {
    const item = sliceToItineraryItem(slices[1], makeId);

    expect(item.savedTravelNotes).toBeUndefined();
    expect(item.sourceInspirationIds).toBeUndefined();
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

  it('不會被當成收藏靈感或 AI 建議——來源標成截圖，不冒充別人的身分', () => {
    const item = sliceToItineraryItem(slices[0], makeId);

    expect(item.origin).toBeUndefined();
    // The linkage exists so the notes survive a reload, but it is a screenshot
    // marker — it matches no saved inspiration group, so nothing reads this
    // card as a place somebody saved from the community.
    expect(item.sourceInspirationIds?.every(id => id.startsWith('screenshot:'))).toBe(true);
  });
});

/**
 * 「解析結果應該條列重點」.
 *
 * Asked for notes, the model returned an essay: 단골손님 came back as four hundred
 * characters of 「推薦…值得…深受好評…推薦」, the same sentence rephrased until it
 * ran out of room. Nobody reads that standing outside a restaurant.
 *
 * The prompt now asks for short bullets, but a prompt is a request. These are
 * the limits.
 */
describe('讀出來的要是重點，不是一篇介紹文', () => {
  const essay = '韓式創意料理餐廳，特色為大份量的拌飯與湯鍋類餐點物，適合多人聚餐分享其招牌美食。'
    + '店名意為「老顧客」。這家店是釜山探店合集中的推薦店家之一，值得造訪體驗其豐富的餐飲選擇與在地好味道的味道。'
    + '這家店的招牌菜餚讓人印象深刻值得品嚐其特色推薦。這家店的菜色不僅美味且視覺效果極佳，深受食客好評推薦推薦。';

  const sliceWith = (over: Record<string, unknown>) =>
    normalizeItinerarySlices({ slices: [{ type: 'food', title: '단골손님', ...over }] })[0];

  it('一整段介紹文被切回一句', () => {
    const slice = sliceWith({ summary: essay });

    expect(slice.summary!.length).toBeLessThanOrEqual(41);
    expect(slice.summary).not.toContain('深受食客好評');
  });

  it('沒有內容的稱讚不會變成摘要', () => {
    expect(sliceWith({ summary: '值得推薦' }).summary).toBeUndefined();
    expect(sliceWith({ summary: '深受好評' }).summary).toBeUndefined();
  });

  it('每一則筆記只留一個重點', () => {
    const slice = sliceWith({ notes: [{ text: essay }] });

    expect(slice.notes[0].text.length).toBeLessThanOrEqual(41);
  });

  it('空話筆記直接丟掉', () => {
    const slice = sliceWith({
      notes: [{ text: '晚上七點後要排隊' }, { text: '非常推薦' }, { text: '很好吃' }],
    });

    expect(slice.notes.map(note => note.text)).toEqual(['晚上七點後要排隊']);
  });

  it('同一件事換句話說不會變成兩則', () => {
    const slice = sliceWith({
      notes: [{ text: '晚上七點後要排隊' }, { text: '晚上七點後要排隊。' }, { text: '週一公休' }],
    });

    expect(slice.notes.map(note => note.text)).toEqual(['晚上七點後要排隊', '週一公休']);
  });

  it('最多六則——再多就不是重點了', () => {
    const slice = sliceWith({
      notes: Array.from({ length: 12 }, (_, index) => ({ text: `重點 ${index + 1} 要注意的事` })),
    });

    expect(slice.notes).toHaveLength(6);
  });

  it('本來就短的照原樣留著', () => {
    const slice = sliceWith({ summary: '韓式創意料理餐廳', notes: [{ text: '招牌是大份量拌飯' }] });

    expect(slice.summary).toBe('韓式創意料理餐廳');
    expect(slice.notes[0].text).toBe('招牌是大份量拌飯');
  });
});
