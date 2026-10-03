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

  it('drops a fragment that adds nothing to a fuller note', () => {
    // 「週二」 beside 「週二公休日請注意」 is the first two characters of it.
    expect(dedupeNoteTexts(['週二公休日請注意', '週二'])).toEqual(['週二公休日請注意']);
  });

  it('keeps a short note that carries its own fact', () => {
    expect(dedupeNoteTexts(['週二公休日請注意', '可以刷卡'])).toHaveLength(2);
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

/**
 * 「我覺得筆記的內容 不能有重複的句意」.
 *
 * 味贊王鹽烤肉 still listed seven points for five facts: the closing hours twice,
 * and 五花肉 recommended twice. Both escaped the previous rules — one because a
 * word was wedged into the middle of the repeat, the other because the two
 * screenshots were written in different scripts.
 */
describe('同一件事換句話說', () => {
  const pork = [
    '饭点人超多需排号',
    '营业时间：12:00 - 23:00（15:00 - 17:00 为休息准备时间）',
    '推荐菜品：五花肉',
    '15:00-17:00 为休息时间',
    '巨巨好吃的烤肉，强推五花肉',
    '配鹽和各種小菜',
    '位於海雲台',
  ];

  it('drops the repeat that had a word wedged into it', () => {
    // 「15:00-17:00 为休息时间」 is 「…15:00-17:00 为休息准备时间」 with 准备 removed,
    // so it is not a substring of it — but every character is there, in order.
    expect(dedupeNoteTexts(pork)).not.toContain('15:00-17:00 为休息时间');
  });

  it('drops the second recommendation of the same dish', () => {
    expect(dedupeNoteTexts(pork)).not.toContain('巨巨好吃的烤肉，强推五花肉');
  });

  it('keeps everything that is its own fact', () => {
    expect(dedupeNoteTexts(pork)).toEqual([
      '饭点人超多需排号',
      '营业时间：12:00 - 23:00（15:00 - 17:00 为休息准备时间）',
      '推荐菜品：五花肉',
      '配鹽和各種小菜',
      '位於海雲台',
    ]);
  });

  it('reads simplified and traditional as the same word', () => {
    // 「推荐」 and 「推薦」 are one word; two scripts in one upload is the normal
    // case when a friend's screenshots come from both sides of the strait.
    expect(dedupeNoteTexts(['推薦菜品：五花肉', '推荐菜品：五花肉'])).toHaveLength(1);
  });

  it('never folds two notes carrying different numbers', () => {
    // Alike in shape, different in fact. A figure is the one thing that must
    // never be assumed to be a rewording.
    expect(dedupeNoteTexts(['門票 12000 韓元', '建議預留 3 小時以上'])).toHaveLength(2);
    expect(dedupeNoteTexts(['成人門票 12000 韓元', '兒童門票 8000 韓元'])).toHaveLength(2);
  });

  it('still keeps what to order beside what the place is', () => {
    expect(dedupeNoteTexts(['海鮮麵餐廳', '必點海鮮麵'])).toHaveLength(2);
  });
});

/**
 * 「這修正過了 又重複內容」.
 *
 * 味贊王鹽烤肉 came back with 「鹽烤肉餐廳」 and 「五花肉Q彈多汁」 beside
 * 「推荐菜品：五花肉」. The first says what the place's own name already says;
 * the second is the same recommendation plus how good it tasted.
 */
describe('a note that adds only enthusiasm, or only the name', () => {
  const pork = [
    '饭点人超多需排号',
    '营业时间：12:00 - 23:00（15:00 - 17:00 为休息准备时间）',
    '推荐菜品：五花肉',
    '鹽烤肉餐廳',
    '五花肉Q彈多汁',
    '配鹽和各種小菜',
    '位於海雲台',
  ];

  it('drops a description that only repeats the place name', () => {
    expect(dedupeNoteTexts(pork, '味贊王鹽烤肉')).not.toContain('鹽烤肉餐廳');
  });

  it('drops a second mention of the same dish that only says it was good', () => {
    // Texture and taste are the writer's experience of a dish, not a second fact
    // about it — and the dish was already named.
    expect(dedupeNoteTexts(pork, '味贊王鹽烤肉')).not.toContain('五花肉Q彈多汁');
  });

  it('keeps the five that are each their own fact', () => {
    expect(dedupeNoteTexts(pork, '味贊王鹽烤肉')).toEqual([
      '饭点人超多需排号',
      '营业时间：12:00 - 23:00（15:00 - 17:00 为休息准备时间）',
      '推荐菜品：五花肉',
      '配鹽和各種小菜',
      '位於海雲台',
    ]);
  });

  it('still keeps what to order at a place named after the dish', () => {
    // 「必點海鮮麵」 repeats the name too, and is the one line worth reading.
    expect(dedupeNoteTexts(['海鮮麵餐廳', '必點海鮮麵', '對面是廣安里海水浴場'], 'Nasari Sigdang'))
      .toHaveLength(3);
  });

  it('keeps a description that adds more than a category word', () => {
    expect(dedupeNoteTexts(['韓國特色傳統市場', '推薦糖餅', '排隊人潮多'], '海雲台傳統市場'))
      .toHaveLength(3);
  });

  it('leaves everything alone when the place name is not given', () => {
    expect(dedupeNoteTexts(['鹽烤肉餐廳'])).toEqual(['鹽烤肉餐廳']);
  });
});
