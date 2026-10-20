/**
 * @vitest-environment jsdom
 *
 * 「我原本存 40 個」 — and the collection was down to twenty-two.
 *
 * 「把這 N 個退回未對應」 writes `country: undefined` and `city: undefined` onto
 * every record it touches, by design: the whole point is to forget a map
 * binding that went to the wrong place. `JSON.stringify` omits an undefined
 * key, and the loader required nine non-empty strings — `country` and `city`
 * among them — so the record came back without one, failed the gate, and was
 * filtered out. The standing save effect then wrote the shortened list back,
 * which made it permanent after a single reload.
 *
 * The button's own label is 「只清掉地圖對應，店名和你寫的筆記都留著」.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY,
  loadSavedTravelInspirations,
  saveSavedTravelInspirations,
} from './savedTravelInspirationPersistence';
import { SavedTravelInspiration } from '../types';

const saved = (over: Partial<SavedTravelInspiration> = {}): SavedTravelInspiration => ({
  id: 'a',
  savedByUserId: 'me',
  country: '日本',
  city: '東京',
  placeName: '黑船亭',
  sourcePostId: 'p',
  sourceSliceId: 's',
  sourceCreatorId: 'c',
  sourceNoteIds: ['n1'],
  savedAt: '2026-10-01T00:00:00.000Z',
  notes: [],
  ...over,
} as SavedTravelInspiration);

beforeEach(() => localStorage.clear());

describe('a saved place survives a reload', () => {
  it('keeps one that was unbound from its map place', () => {
    // Exactly what 把這 N 個退回未對應 leaves behind.
    const unbound = { ...saved(), country: undefined, city: undefined };
    localStorage.setItem(SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY, JSON.stringify([unbound]));

    const [reloaded] = loadSavedTravelInspirations();

    expect(reloaded).toMatchObject({ id: 'a', placeName: '黑船亭', country: '', city: '' });
  });

  /*
    The notes are the part the label promised. Losing the record loses them,
    and they are the only thing on it somebody wrote by hand.
  */
  it('keeps the notes on it', () => {
    const withNotes = saved({
      notes: [{
        id: 'n1', sourceNoteId: 'n1', sourceSliceId: 's', sourcePostId: 'p',
        sourceCreatorId: 'c', type: 'tip', text: '傍晚去比較漂亮',
      }] as SavedTravelInspiration['notes'],
    });
    localStorage.setItem(
      SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY,
      JSON.stringify([{ ...withNotes, country: undefined, city: undefined }]),
    );

    expect(loadSavedTravelInspirations()[0].notes[0].text).toBe('傍晚去比較漂亮');
  });

  /*
    A cloud row with a null in any of six columns arrives as an empty string.
    That used to be a delete on the next reload, which made every
    cloud-hydrated save quietly lossy.
  */
  it('keeps one whose source attribution never arrived', () => {
    const fromCloud = saved({ sourcePostId: '', sourceSliceId: '', sourceCreatorId: '', savedByUserId: '' });
    saveSavedTravelInspirations([fromCloud]);

    expect(loadSavedTravelInspirations()).toHaveLength(1);
  });

  it('survives a save and a load unchanged', () => {
    saveSavedTravelInspirations([saved()]);

    expect(loadSavedTravelInspirations()[0]).toMatchObject({
      id: 'a', country: '日本', city: '東京', placeName: '黑船亭',
    });
  });

  /* A record with no name is not a place. That one may still go. */
  it('still drops something that is not a saved place at all', () => {
    localStorage.setItem(SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY, JSON.stringify([
      { id: 'a' }, { placeName: '沒有 id' }, null, 'nonsense',
    ]));

    expect(loadSavedTravelInspirations()).toEqual([]);
  });
});
