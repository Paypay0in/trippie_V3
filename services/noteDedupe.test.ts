import { describe, expect, it } from 'vitest';
import { dedupeNoteTexts, noteIsCovered, normalizeItinerarySlices } from './itineraryImageSlices';
import { mergeScreenshotInspirations, slicesToSavedInspirations } from './screenshotInspiration';

/**
 * 「我剛重新上傳一次 資訊會重複紀錄」.
 *
 * His 味贊王鹽烤肉 came back with the opening hours three times over: once in
 * full, once without the break, and once as the break alone. Exact-text dedupe
 * kept all three, so a place with two facts read as a place with five.
 */

describe('dedupeNoteTexts', () => {
  it('drops a note contained in a longer one', () => {
    expect(dedupeNoteTexts([
      '營業時間：12:00 - 23:00（15:00 - 17:00 為休息準備時間）',
      '營業時間 12:00-23:00',
    ])).toEqual(['營業時間：12:00 - 23:00（15:00 - 17:00 為休息準備時間）']);
  });

  it('keeps the order the notes arrived in', () => {
    expect(dedupeNoteTexts(['飯點人超多需排號', '推薦菜品：五花肉'])).toEqual([
      '飯點人超多需排號',
      '推薦菜品：五花肉',
    ]);
  });

  it('keeps two notes that say different things', () => {
    expect(dedupeNoteTexts(['飯點人超多需排號', '推薦菜品：五花肉'])).toHaveLength(2);
  });

  it('does not let a very short note swallow a longer one', () => {
    expect(dedupeNoteTexts(['週二公休日請注意', '週二'])).toHaveLength(2);
  });
});

describe('noteIsCovered', () => {
  it('treats punctuation and spacing as noise', () => {
    expect(noteIsCovered('15:00-17:00 為休息時間', '15:00 - 17:00 為休息時間')).toBe(true);
  });

  it('is false for a different fact', () => {
    expect(noteIsCovered('推薦菜品：五花肉', '飯點人超多需排號')).toBe(false);
  });
});

describe('a screenshot parsed twice', () => {
  const parse = (notes: string[]) => normalizeItinerarySlices({
    slices: [{
      type: 'food',
      title: '味贊王鹽烤肉',
      summary: '韓式烤肉店',
      notes: notes.map(text => ({ text })),
    }],
  });

  it('does not stack the same fact on re-upload', () => {
    const context = {
      savedByUserId: 'north',
      country: '韓國',
      city: '釜山',
      makeId: (() => { let n = 0; return () => `id-${n += 1}`; })(),
      savedAt: '2026-10-03T09:00:00.000Z',
    };

    const first = slicesToSavedInspirations(
      parse(['營業時間：12:00-23:00（15:00-17:00 為休息準備時間）', '推薦菜品：五花肉']),
      context,
    );
    const second = slicesToSavedInspirations(
      parse(['營業時間 12:00-23:00', '推薦菜品：五花肉', '飯點人超多需排號']),
      context,
    );

    const merged = mergeScreenshotInspirations(first, second);
    expect(merged).toHaveLength(1);
    expect(merged[0].notes.map(note => note.text)).toEqual([
      '韓式烤肉店',
      '營業時間：12:00-23:00（15:00-17:00 為休息準備時間）',
      '推薦菜品：五花肉',
      '飯點人超多需排號',
    ]);
  });
});

/**
 * 「這三句語意相同，不能這樣列，要換成一句」.
 *
 * Peak square came back as 「海邊景觀咖啡店」, 「海邊咖啡店」 and 「有看海景觀位」: one
 * fact, three sentences, none containing another as a string. A model with
 * little to report pads, and the prompt already forbade it — so the limit has
 * to be in the code.
 */
describe('a place described three times', () => {
  it('keeps one description', () => {
    expect(dedupeNoteTexts(['海邊景觀咖啡店', '海邊咖啡店', '有看海景觀位']))
      .toEqual(['海邊景觀咖啡店']);
  });

  it('keeps the first, which is the one the model led with', () => {
    expect(dedupeNoteTexts(['海邊咖啡店', '海邊景觀咖啡店'])).toEqual(['海邊咖啡店']);
  });

  it('never drops something to act on, however much it overlaps', () => {
    // 「必點海鮮麵」 is not 「海鮮麵餐廳」 said twice: one is what the place is,
    // the other is what to order there.
    expect(dedupeNoteTexts(['海鮮麵餐廳', '必點海鮮麵', '對面是廣安里海水浴場'])).toEqual([
      '海鮮麵餐廳',
      '必點海鮮麵',
      '對面是廣安里海水浴場',
    ]);
  });

  it('keeps a description that carries real detail', () => {
    // 「章魚蝦仁五花肉三拼加方便麵」 overlaps 「辣炒章魚餐廳」 but adds what is in it.
    expect(dedupeNoteTexts(['辣炒章魚餐廳', '章魚蝦仁五花肉三拼加方便麵', '位於海雲台'])).toEqual([
      '辣炒章魚餐廳',
      '章魚蝦仁五花肉三拼加方便麵',
      '位於海雲台',
    ]);
  });

  it('does not fold two descriptions that share one character by chance', () => {
    expect(dedupeNoteTexts(['人氣Brunch餐廳', '加辣版番茄意面'])).toHaveLength(2);
  });
});
