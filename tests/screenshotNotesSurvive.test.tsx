/**
 * @vitest-environment jsdom
 *
 * 「透析完筆記，要根據各推薦抓重點，之後建立行程時也要顯示筆記」.
 *
 * The practical lines a friend's screenshot carries — 要排隊、幾點公休、必點什麼 —
 * are the reason to screenshot it. They have to reach the itinerary card as
 * notes, and still be there after a reload: the persistence layer drops
 * savedTravelNotes from an item with no source linkage, so a card that arrived
 * without one would quietly lose them the next time the app opened.
 */
import { describe, expect, it } from 'vitest';
import { normalizeItinerarySlices, sliceToItineraryItem } from '../services/itineraryImageSlices';
import { readDraftStore, writeDraftStore } from '../services/tripPersistence';
import type { TripDraft } from '../types';

const slicesFrom = (notes: string[]) => normalizeItinerarySlices({
  slices: [{ type: 'food', title: '大師兄牛肉麵', notes: notes.map(text => ({ text })) }],
});

const draftWith = (itinerary: unknown[]): TripDraft => ({
  id: 'd1', name: '釜山', expenses: [], companions: [], shoppingList: [],
  itinerary, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
} as unknown as TripDraft);

describe('截圖讀到的筆記', () => {
  it('變成卡片上的旅行筆記', () => {
    let n = 0;
    const item = sliceToItineraryItem(slicesFrom(['晚上七點後要排隊', '必點小菜'])[0], () => `id-${++n}`);

    expect(item.savedTravelNotes?.map(note => note.text)).toEqual(['晚上七點後要排隊', '必點小菜']);
  });

  it('重新載入之後還在', () => {
    let n = 0;
    const item = sliceToItineraryItem(slicesFrom(['晚上七點後要排隊'])[0], () => `id-${++n}`, '2026-10-03');

    writeDraftStore([draftWith([item])], 'd1');
    const reloaded = readDraftStore().drafts[0]?.itinerary?.[0];

    expect(reloaded?.savedTravelNotes?.map(note => note.text)).toEqual(['晚上七點後要排隊']);
  });

  it('沒有來源連結的話就會掉——這正是為什麼截圖要標來源', () => {
    let n = 0;
    const item = sliceToItineraryItem(slicesFrom(['晚上七點後要排隊'])[0], () => `id-${++n}`, '2026-10-03');

    writeDraftStore([draftWith([{ ...item, sourceInspirationIds: [] }])], 'd1');

    expect(readDraftStore().drafts[0]?.itinerary?.[0]?.savedTravelNotes).toBeUndefined();
  });
});

/**
 * 「之後建立行程時也要顯示筆記」 — including when the AI is the one building it.
 *
 * 補充行程 forwarded a place's inspiration linkage onto the new card but not the
 * notes saved with it, so the AI scheduled the restaurant and left behind the
 * only part worth reading while standing outside it.
 */
describe('AI 排進行程的卡片', () => {
  const proposal = {
    mode: 'add' as const,
    summary: '',
    warnings: [],
    changes: [{
      type: 'add' as const,
      toDate: '2026-10-04',
      toTime: '18:30',
      placeName: '大師兄牛肉麵',
      proposedItem: {
        placeName: '大師兄牛肉麵',
        sourceInspirationIds: ['insp-noodles'],
        source: 'saved_inspiration' as const,
      },
    }],
  };

  const note = (text: string) => ({
    id: `n-${text}`, sourceNoteId: `n-${text}`, sourceSliceId: 's', sourcePostId: 'p',
    sourceCreatorId: 'c', type: 'other' as const, text,
  });

  it('帶著收藏時的筆記', async () => {
    const { applyItineraryAdjustment } = await import('../services/itineraryAdjustment');

    const result = applyItineraryAdjustment([], proposal as never, () => 'new-1',
      ids => (ids.includes('insp-noodles') ? [note('晚上七點後要排隊')] : undefined));

    expect(result.items[0].savedTravelNotes?.map(entry => entry.text)).toEqual(['晚上七點後要排隊']);
  });

  it('沒有提供查詢時行為不變，不會憑空生出筆記', async () => {
    const { applyItineraryAdjustment } = await import('../services/itineraryAdjustment');

    const result = applyItineraryAdjustment([], proposal as never, () => 'new-1');

    expect(result.items[0].savedTravelNotes).toBeUndefined();
  });

  it('查不到筆記的地點不會掛上空的筆記區塊', async () => {
    const { applyItineraryAdjustment } = await import('../services/itineraryAdjustment');

    const result = applyItineraryAdjustment([], proposal as never, () => 'new-1', () => []);

    expect(result.items[0].savedTravelNotes).toBeUndefined();
  });
});
