import { describe, it, expect } from 'vitest';
import { ItineraryItem } from '../types';
import { ProposedItineraryItem } from './itineraryPlanningService';
import {
  buildAcceptedItineraryItems,
  mergeAcceptedItinerary,
  toItineraryItem,
} from './itineraryAcceptance';

const saved = (overrides: Partial<ProposedItineraryItem> = {}): ProposedItineraryItem => ({
  id: 'proposed-1',
  placeName: '海雲台',
  placeId: 'place-haeundae',
  coordinates: { latitude: 35.1587, longitude: 129.1604 },
  suggestedStartTime: '17:30',
  durationMinutes: 90,
  note: '收藏筆記說傍晚比較漂亮。',
  sourceInspirationIds: ['insp-a'],
  source: 'saved_inspiration',
  ...overrides,
});

const suggested = (overrides: Partial<ProposedItineraryItem> = {}): ProposedItineraryItem => ({
  id: 'proposed-2',
  placeName: '虛月汗蒸幕',
  suggestedStartTime: '20:00',
  durationMinutes: 120,
  note: '你說想安排汗蒸幕，放在晚上收尾。',
  sourceInspirationIds: [],
  source: 'ai_suggestion',
  ...overrides,
});

const existingItem = (overrides: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: 'existing-1',
  date: '2026-10-03',
  time: '09:00',
  title: '既有行程',
  location: '既有行程',
  notes: '',
  type: 'ACTIVITY',
  ...overrides,
});

const sequentialIds = () => {
  let counter = 0;
  return () => `generated-${(counter += 1)}`;
};

describe('toItineraryItem', () => {
  it('carries place identity, timing and provenance into the official item', () => {
    const item = toItineraryItem(saved(), '2026-10-03', 'new-1');
    expect(item).toMatchObject({
      id: 'new-1',
      date: '2026-10-03',
      time: '17:30',
      title: '海雲台',
      location: '海雲台',
      notes: '收藏筆記說傍晚比較漂亮。',
      type: 'ACTIVITY',
      isCompleted: false,
      placeId: 'place-haeundae',
      latitude: 35.1587,
      longitude: 129.1604,
      durationMinutes: 90,
      origin: 'saved_inspiration',
      sourceInspirationIds: ['insp-a'],
    });
  });

  it('keeps an AI suggestion distinguishable and free of invented identity', () => {
    const item = toItineraryItem(suggested(), '2026-10-03', 'new-2');
    expect(item.origin).toBe('ai_suggestion');
    expect(item.placeId).toBeUndefined();
    expect('sourceInspirationIds' in item).toBe(false);
  });

  it('copies the provenance array instead of aliasing the proposal', () => {
    const source = saved();
    const item = toItineraryItem(source, '2026-10-03', 'new-3');
    item.sourceInspirationIds?.push('insp-injected');
    expect(source.sourceInspirationIds).toEqual(['insp-a']);
  });

  it('leaves time empty when the proposal suggested none', () => {
    expect(toItineraryItem(saved({ suggestedStartTime: undefined }), '2026-10-03', 'new-4').time).toBe('');
  });

  it('carries a resolved address so the card can show the location', () => {
    const item = toItineraryItem(saved({ address: '52 Jagalchihaean-ro, Jung-gu, Busan' }), '2026-10-03', 'new-5');
    expect(item.address).toBe('52 Jagalchihaean-ro, Jung-gu, Busan');
  });

  it('omits address entirely rather than storing an empty string', () => {
    expect('address' in toItineraryItem(saved({ address: undefined }), '2026-10-03', 'new-6')).toBe(false);
  });

  it('maps an enriched AI suggestion without granting it saved provenance', () => {
    // What an item looks like after place enrichment: real identity, AI origin.
    const enriched = suggested({
      placeId: 'ChIJudkrFArpaDURbbCzajeQs0c',
      coordinates: { latitude: 35.0966339, longitude: 129.0307965 },
      address: '52 Jagalchihaean-ro, Jung-gu, Busan, 南韓',
      suggestedStartTime: '11:00',
    });
    const item = toItineraryItem(enriched, '2026-10-02', 'new-7');
    expect(item).toMatchObject({
      time: '11:00',
      placeId: 'ChIJudkrFArpaDURbbCzajeQs0c',
      latitude: 35.0966339,
      address: '52 Jagalchihaean-ro, Jung-gu, Busan, 南韓',
      origin: 'ai_suggestion',
    });
    expect('sourceInspirationIds' in item).toBe(false);
  });
});

describe('buildAcceptedItineraryItems', () => {
  it('flattens every day and gives each item a fresh id', () => {
    const items = buildAcceptedItineraryItems({
      days: [
        { date: '2026-10-02', items: [saved()] },
        { date: '2026-10-03', items: [suggested(), saved({ placeId: 'place-gamcheon', placeName: '甘川文化村', sourceInspirationIds: ['insp-b'] })] },
      ],
    }, sequentialIds());

    expect(items.map(item => item.id)).toEqual(['generated-1', 'generated-2', 'generated-3']);
    expect(items.map(item => item.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-03']);
  });
});

describe('mergeAcceptedItinerary — append', () => {
  it('keeps existing items and appends the proposal', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem()],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.items).toHaveLength(2);
    expect(result.addedCount).toBe(1);
    expect(result.removedCount).toBe(0);
  });

  it('drops a proposal item whose placeId is already in the itinerary, on any day', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ placeId: 'place-haeundae', date: '2026-10-05' })],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.addedCount).toBe(0);
    expect(result.skippedDuplicateCount).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('drops a proposal item already present through saved-inspiration provenance', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ title: '海雲台海水浴場', location: '海雲台海水浴場', sourceInspirationIds: ['insp-a'] })],
      accepted: [toItineraryItem(saved({ placeId: undefined }), '2026-10-03', 'new-1')],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.skippedDuplicateCount).toBe(1);
  });

  it('never treats a shared name as identity: same name, different placeId, both kept', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ title: '海雲台', location: '海雲台', placeId: 'place-other-haeundae' })],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.addedCount).toBe(1);
    expect(result.skippedDuplicateCount).toBe(0);
  });

  it('keeps an unidentified AI suggestion whose wording merely resembles an existing item', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ title: '虛月汗蒸幕', location: '虛月汗蒸幕', time: '14:00' })],
      accepted: [toItineraryItem(suggested(), '2026-10-03', 'new-1')],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.addedCount).toBe(1);
  });

  it('drops only an exact repeat of an unidentified AI suggestion', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ title: '虛月汗蒸幕', location: '虛月汗蒸幕', time: '20:00', date: '2026-10-03' })],
      accepted: [toItineraryItem(suggested(), '2026-10-03', 'new-1')],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.addedCount).toBe(0);
    expect(result.skippedDuplicateCount).toBe(1);
  });

  it('does not let two proposal items collapse into each other by name alone', () => {
    const result = mergeAcceptedItinerary({
      existing: [],
      accepted: [
        toItineraryItem(suggested(), '2026-10-03', 'new-1'),
        toItineraryItem(suggested({ suggestedStartTime: '10:00' }), '2026-10-05', 'new-2'),
      ],
      mode: 'append',
    });

    expect(result.addedCount).toBe(2);
  });
});

describe('mergeAcceptedItinerary — replace', () => {
  it('clears the trip range and writes the proposal', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ id: 'old-1', date: '2026-10-03' }), existingItem({ id: 'old-2', date: '2026-10-04' })],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'replace',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.removedCount).toBe(2);
    expect(result.items.map(item => item.id)).toEqual(['new-1']);
  });

  it('never destroys data outside the trip range', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ id: 'before', date: '2026-09-30' }), existingItem({ id: 'after', date: '2026-11-01' })],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'replace',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.removedCount).toBe(0);
    expect(result.items.map(item => item.id)).toEqual(['before', 'new-1', 'after']);
  });

  it('keeps an undated item, which is not provably inside the range', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ id: 'undated', date: undefined })],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'replace',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.items.map(item => item.id)).toContain('undated');
  });

  it('keeps flight-anchor and expense-linked items inside the range', () => {
    const result = mergeAcceptedItinerary({
      existing: [
        existingItem({ id: 'flight', date: '2026-10-02', type: 'FLIGHT', derivedFromFlightAnchorId: 'anchor-1' }),
        existingItem({ id: 'paid', date: '2026-10-03', linkedExpenseId: 'expense-1' }),
        existingItem({ id: 'plain', date: '2026-10-03' }),
      ],
      accepted: [toItineraryItem(saved(), '2026-10-04', 'new-1')],
      mode: 'replace',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.items.map(item => item.id).sort()).toEqual(['flight', 'new-1', 'paid']);
    expect(result.removedCount).toBe(1);
  });

  it('falls back to the accepted dates when the trip has no usable range', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ id: 'same-day', date: '2026-10-03' }), existingItem({ id: 'other-day', date: '2026-10-09' })],
      accepted: [toItineraryItem(saved(), '2026-10-03', 'new-1')],
      mode: 'replace',
    });

    expect(result.items.map(item => item.id)).toEqual(['new-1', 'other-day']);
  });

  it('writes only the proposal it was handed, so an earlier proposal cannot leak in', () => {
    const firstProposal = buildAcceptedItineraryItems({ days: [{ date: '2026-10-02', items: [saved()] }] }, sequentialIds());
    const afterFirst = mergeAcceptedItinerary({
      existing: [], accepted: firstProposal, mode: 'append', startDate: '2026-10-02', endDate: '2026-10-07',
    });

    const regenerated = buildAcceptedItineraryItems({ days: [{ date: '2026-10-05', items: [suggested()] }] }, sequentialIds());
    const afterRegenerate = mergeAcceptedItinerary({
      existing: [], accepted: regenerated, mode: 'replace', startDate: '2026-10-02', endDate: '2026-10-07',
    });

    expect(afterFirst.items.map(item => item.title)).toEqual(['海雲台']);
    expect(afterRegenerate.items.map(item => item.title)).toEqual(['虛月汗蒸幕']);
  });
});

describe('mergeAcceptedItinerary — ordering', () => {
  it('returns the itinerary sorted by date then time', () => {
    const result = mergeAcceptedItinerary({
      existing: [existingItem({ id: 'later', date: '2026-10-04', time: '08:00' })],
      accepted: [
        toItineraryItem(suggested(), '2026-10-03', 'evening'),
        toItineraryItem(saved({ placeId: 'place-gamcheon', sourceInspirationIds: ['insp-b'], suggestedStartTime: '11:00' }), '2026-10-03', 'morning'),
      ],
      mode: 'append',
      startDate: '2026-10-02',
      endDate: '2026-10-07',
    });

    expect(result.items.map(item => item.id)).toEqual(['morning', 'evening', 'later']);
  });
});

/* ------------------------------------------------------------------ *
 * Lane M: saved travel notes survive acceptance, and only with proof
 * ------------------------------------------------------------------ */

describe('saved travel notes on acceptance', () => {
  const note = (id: string, text: string) => ({
    id, sourceNoteId: `sn-${id}`, sourceSliceId: 'ss-1', sourcePostId: 'sp-1', sourceCreatorId: 'sc-1',
    type: 'recommendation' as const, text,
  });

  it('carries the saved place notes onto the official itinerary item', () => {
    const item = toItineraryItem({
      id: 'p1',
      placeName: '甘川文化村',
      placeId: 'place-gamcheon',
      suggestedStartTime: '16:30',
      sourceInspirationIds: ['insp-gamcheon'],
      source: 'saved_inspiration',
      experienceNotes: [note('n1', '下午拍照光線很好'), note('n2', '建議預留兩小時')],
    }, '2026-10-02', 'it-1');

    expect(item.origin).toBe('saved_inspiration');
    expect(item.sourceInspirationIds).toEqual(['insp-gamcheon']);
    expect(item.savedTravelNotes?.map(entry => entry.text)).toEqual(['下午拍照光線很好', '建議預留兩小時']);
    // Notes are the note model, not a copy of the source post.
    expect(Object.keys(item.savedTravelNotes![0]).sort()).toEqual(['id', 'sourceCreatorId', 'sourceNoteId', 'sourcePostId', 'sourceSliceId', 'text', 'type']);
  });

  it('never attaches notes to an AI suggestion, even one carrying them', () => {
    // A name collision is the whole risk here: 甘川文化村 as an untagged suggestion
    // must not inherit the saved place's notes.
    const item = toItineraryItem({
      id: 'p2',
      placeName: '甘川文化村',
      sourceInspirationIds: [],
      source: 'ai_suggestion',
      experienceNotes: [note('n1', '下午拍照光線很好')],
    }, '2026-10-02', 'it-2');

    expect(item.origin).toBe('ai_suggestion');
    expect(item.savedTravelNotes).toBeUndefined();
    expect(item.sourceInspirationIds).toBeUndefined();
  });

  it('leaves the field absent when the saved place has no notes', () => {
    const item = toItineraryItem({
      id: 'p3', placeName: '海雲台', placeId: 'place-haeundae',
      sourceInspirationIds: ['insp-haeundae'], source: 'saved_inspiration',
    }, '2026-10-02', 'it-3');
    expect(item.savedTravelNotes).toBeUndefined();
  });
});
