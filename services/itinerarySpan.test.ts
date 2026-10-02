/**
 * 「1. 每個行程起訖時間都要可以填寫 目前只有起的時間 若沒有填寫訖的時間一律以 60
 *   分鐘為主 2. 後面行程就需要回避掉已經被 book 的時間」
 *
 * The hour was already the assumption everywhere — collisions, travel gaps, the
 * AI scheduler all used it — but it was never shown, so a day could not be read
 * and the overlap warnings arrived out of nowhere.
 */
import { describe, expect, it } from 'vitest';
import {
  applyDurationChange,
  DEFAULT_DURATION_MINUTES,
  durationFromEnd,
  endTimeOf,
} from './itineraryTimeline';
import { ItineraryItem } from '../types';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '10:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: '2026-10-03', ...over,
});

describe('一個行程的起訖', () => {
  it('沒填停留時間時，結束時間就是開始加 60 分鐘', () => {
    expect(endTimeOf(item({ time: '10:00' }))).toBe('11:00');
    expect(DEFAULT_DURATION_MINUTES).toBe(60);
  });

  it('有填就用填的', () => {
    expect(endTimeOf(item({ time: '10:00', durationMinutes: 150 }))).toBe('12:30');
  });

  it('沒有開始時間就沒有結束時間——沒有起點的終點不是一段時間', () => {
    expect(endTimeOf(item({ time: '' }))).toBe('');
  });

  it('從結束時間算回停留時間', () => {
    expect(durationFromEnd('10:00', '11:30')).toBe(90);
  });

  it('結束早於開始時不接受——那是選錯了，不是一段負的時間', () => {
    expect(durationFromEnd('21:00', '09:00')).toBeUndefined();
    expect(durationFromEnd('10:00', '10:00')).toBeUndefined();
  });
});

/** His day 3: brunch at 10:00, Panier at 10:15. */
const day = [
  item({ id: 'brunch', time: '10:00', title: '早午餐' }),
  item({ id: 'panier', time: '10:15', title: 'Panier' }),
  item({ id: 'beach', time: '13:00', title: '廣安里海水浴場' }),
];

describe('拉長一個行程之後', () => {
  it('擋在新時段裡的行程會被往後移', () => {
    const { items, changed } = applyDurationChange(day, 'brunch', 120);
    const byId = new Map(items.map(entry => [entry.id, entry]));

    expect(changed).toBe(true);
    expect(byId.get('brunch')?.durationMinutes).toBe(120);
    // Brunch now runs to 12:00, so Panier moves clear of it.
    expect(byId.get('panier')?.time).toBe('12:30');
  });

  it('已經閃開的行程不會被動到', () => {
    const { items } = applyDurationChange(day, 'brunch', 120);

    expect(items.find(entry => entry.id === 'beach')?.time).toBe('13:00');
  });

  it('縮短行程不會把後面的拉前面來——那個空檔可能是故意留的', () => {
    const { items } = applyDurationChange(day, 'brunch', 30);

    expect(items.find(entry => entry.id === 'panier')?.time).toBe('10:15');
  });

  it('航班擋住時就停下來，而不是把飛機往後推', () => {
    const withFlight = [
      item({ id: 'brunch', time: '10:00', title: '早午餐' }),
      item({ id: 'flight', time: '11:00', title: '航班起飛', type: 'FLIGHT' }),
    ];

    const result = applyDurationChange(withFlight, 'brunch', 180, { isFixed: entry => entry.type === 'FLIGHT' });

    expect(result.blockedByFixed).toBe(true);
    expect(result.items.find(entry => entry.id === 'flight')?.time).toBe('11:00');
  });

  it('沒有變化時什麼都不做', () => {
    expect(applyDurationChange(day, 'brunch', 0).changed).toBe(false);
    expect(applyDurationChange(day, '不存在', 90).changed).toBe(false);
  });

  it('連鎖推移會一路把擋住的都挪開', () => {
    const packed = [
      item({ id: 'a', time: '10:00', durationMinutes: 30, title: 'A' }),
      item({ id: 'b', time: '10:30', durationMinutes: 30, title: 'B' }),
      item({ id: 'c', time: '11:00', durationMinutes: 30, title: 'C' }),
    ];

    const byId = new Map(applyDurationChange(packed, 'a', 120).items.map(entry => [entry.id, entry]));

    expect(byId.get('b')?.time).toBe('12:30');
    // B now ends at 13:00, and C clears it by the usual transit buffer.
    expect(byId.get('c')?.time).toBe('13:30');
  });
});
