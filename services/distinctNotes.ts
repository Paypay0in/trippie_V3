import { SavedExperienceNote } from '../types';
import { dedupeNoteTexts } from './itineraryImageSlices';

/**
 * The notes of one place, with the ones that only restate another removed.
 *
 * 「反覆寫一樣的話」 — 味贊王鹽烤肉 carried 營業時間 12:00-23:00 three times and
 * 五花肉 three more. The rules for deciding that live in `dedupeNoteTexts` and
 * the trip planner has used them for months; the collection screen, which is
 * where somebody actually reads the notes, rendered whatever was stored.
 *
 * Works on the notes rather than on their text so the surviving note keeps its
 * id and its provenance — the picker matches planned places by those, and the
 * collection card shows who wrote each line.
 */
export const keepDistinctNotes = (
  notes: SavedExperienceNote[],
  placeName: string,
): SavedExperienceNote[] => {
  const kept = dedupeNoteTexts(notes.map(note => note.text), placeName);
  const remaining = [...kept];
  return notes.filter(note => {
    const index = remaining.indexOf(note.text.trim());
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
};
