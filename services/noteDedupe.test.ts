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
