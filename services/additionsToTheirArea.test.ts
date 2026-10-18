/**
 * 「我覺得 AI 要有一個概念是 同一區域的可以安排同一天」 — and then 「混排」, twice,
 * after the areas had gone into the prompt by name.
 *
 * Real Tokyo coordinates and the wards Google states for them.
 */
import { describe, expect, it } from 'vitest';
import { additionsToTheirArea } from './additionsToTheirArea';
import { applyItineraryAdjustment } from './itineraryAdjustment';
import { ItineraryItem } from '../types';

const item = (id: string, date: string, over: Partial<ItineraryItem>): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY',
  date, time: '10:00', durationMinutes: 120, ...over,
} as ItineraryItem);

const SHIBUYA = { latitude: 35.6580, longitude: 139.7016, address: '東京都渋谷区道玄坂' };
const SHIBUYA2 = { latitude: 35.6489, longitude: 139.6998, address: '東京都渋谷区代官山町' };
const ASAKUSA = { latitude: 35.7148, longitude: 139.7967, address: '東京都台東区浅草' };
const ASAKUSA2 = { latitude: 35.7101, longitude: 139.8107, address: '東京都台東区雷門' };

describe('新加的地點落在它那一區已經在的那天', () => {
  it('把加到別天的拉回那一區的日子', () => {
    const { items, movedCount } = additionsToTheirArea([
      item('plan-shibuya', '2026-10-21', SHIBUYA),
      item('plan-asakusa', '2026-10-22', ASAKUSA),
      // The model put a 渋谷 place on the 淺草 day.
      item('new-shibuya', '2026-10-22', SHIBUYA2),
    ], new Set(['new-shibuya']), '日本');

    expect(items.find(entry => entry.id === 'new-shibuya')?.date).toBe('2026-10-21');
    expect(movedCount).toBe(1);
  });

  it('已經在對的那天就不動', () => {
    const { movedCount } = additionsToTheirArea([
      item('plan-asakusa', '2026-10-22', ASAKUSA),
      item('new-asakusa', '2026-10-22', ASAKUSA2),
    ], new Set(['new-asakusa']), '日本');

    expect(movedCount).toBe(0);
  });

  /*
    An area nobody has visited yet has nothing to be consistent with, and
    overruling the model there would be inventing a plan rather than tidying
    one.
  */
  it('全新的區保留模型選的日子', () => {
    const { items, movedCount } = additionsToTheirArea([
      item('plan-shibuya', '2026-10-21', SHIBUYA),
      item('new-asakusa', '2026-10-23', ASAKUSA),
    ], new Set(['new-asakusa']), '日本');

    expect(items.find(entry => entry.id === 'new-asakusa')?.date).toBe('2026-10-23');
    expect(movedCount).toBe(0);
  });

  /* The day holding most of that area wins; a tie goes to the earlier date. */
  it('那一區散在兩天時，跟多數那天', () => {
    const { items } = additionsToTheirArea([
      item('a', '2026-10-21', SHIBUYA),
      item('b', '2026-10-22', SHIBUYA2),
      item('c', '2026-10-22', { latitude: 35.6595, longitude: 139.7005, address: '東京都渋谷区宇田川町' }),
      item('new', '2026-10-24', { latitude: 35.6585, longitude: 139.7020, address: '東京都渋谷区神南' }),
    ], new Set(['new']), '日本');

    expect(items.find(entry => entry.id === 'new')?.date).toBe('2026-10-22');
  });

  /* Existing items are the traveller's own arrangement and are never moved. */
  it('不動既有的行程', () => {
    const { items } = additionsToTheirArea([
      item('plan-shibuya', '2026-10-21', SHIBUYA),
      item('plan-strays', '2026-10-23', SHIBUYA2),
    ], new Set(['nothing']), '日本');

    expect(items.find(entry => entry.id === 'plan-strays')?.date).toBe('2026-10-23');
  });

  it('沒有新增項目時什麼都不做', () => {
    const day = [item('a', '2026-10-21', SHIBUYA)];

    expect(additionsToTheirArea(day, new Set(), '日本').items).toBe(day);
  });
});

/**
 * Through the real path. His Oct 23 came back with 東京都現代美術館（Koto City）,
 * Reiyukai Shakaden Temple（Minato City）and Lonich（Taito City）on one day,
 * none of them carrying a time — 「混排 且沒有給時間」.
 *
 * Tested here rather than on the helper because every fix tonight that lived in
 * one caller and not the others was a bug.
 */
describe('套用 AI 調整之後：同區同天，而且每一筆都有時間', () => {
  const existing: ItineraryItem[] = [
    item('plan-asakusa', '2026-10-22', { ...ASAKUSA, title: '淺草寺', location: '淺草寺' }),
    item('plan-minato', '2026-10-23', {
      latitude: 35.6586, longitude: 139.7454, address: '東京都港区芝公園', title: '東京鐵塔', location: '東京鐵塔',
    }),
  ];

  it('把淺草的新地點拉回淺草那天，並給它時間', () => {
    const { items } = applyItineraryAdjustment(
      existing,
      {
        mode: 'add',
        summary: '',
        warnings: [],
        changes: [{
          type: 'add',
          // The model's choice: the Asakusa place on the Minato day, no time.
          toDate: '2026-10-23',
          proposedItem: {
            id: 'p1', placeName: '雷門三定', source: 'ai_suggestion',
            sourceInspirationIds: [], durationMinutes: 60,
            coordinates: { latitude: ASAKUSA2.latitude, longitude: ASAKUSA2.longitude },
            address: ASAKUSA2.address,
          },
        }],
      } as never,
      () => 'added-1',
      undefined,
      '日本',
    );

    const added = items.find(entry => entry.id === 'added-1');
    expect(added?.date).toBe('2026-10-22');
    expect(added?.time).toBeTruthy();
  });
});

/**
 * 「這個行程是固定的 … 那 AI 在規劃行程的時候就要把這區附近的行程規劃在這天」,
 * then 「目前是將這區的行程附近的都放在第五天」.
 *
 * His 淺草 pin sat alone on Day 4 while three 淺草 stops sat on Day 5, so the
 * majority count sent every addition to Day 5 — away from the one stop he had
 * actually decided about.
 */
describe('固定的那天贏過多數決', () => {
  const asakusa = (id: string, date: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
    id, title: id, location: id, notes: '', type: 'ACTIVITY', date, time: '10:00',
    latitude: 35.7148, longitude: 139.7967, address: '2-chōme Kaminarimon, Taito City, Tokyo',
    ...over,
  } as ItineraryItem);

  const trip = [
    asakusa('alchemy', '2026-10-23', { isPinned: true }),
    asakusa('settled-a', '2026-10-24'),
    asakusa('settled-b', '2026-10-24'),
    asakusa('settled-c', '2026-10-24'),
    asakusa('added', '2026-10-21'),
  ];

  it('sends the addition to the pinned day, not the crowded one', () => {
    const result = additionsToTheirArea(trip, new Set(['added']), '日本');

    expect(result.items.find(item => item.id === 'added')?.date).toBe('2026-10-23');
  });

  it('still follows the majority when nothing is pinned', () => {
    const unpinned = trip.map(item =>
      item.id === 'alchemy' ? { ...item, isPinned: undefined } : item);

    const result = additionsToTheirArea(unpinned, new Set(['added']), '日本');

    expect(result.items.find(item => item.id === 'added')?.date).toBe('2026-10-24');
  });

  /* Never moves what it was not asked to move. */
  it('leaves the settled stops where they are', () => {
    const result = additionsToTheirArea(trip, new Set(['added']), '日本');

    expect(result.items.find(item => item.id === 'settled-a')?.date).toBe('2026-10-24');
    expect(result.items.find(item => item.id === 'alchemy')?.date).toBe('2026-10-23');
  });
});
