/**
 * 「動線還是蠻不合理 跨太多區了」. Measured on his three days: 淺草 1.2 km across,
 * 港區 3.3 km, 新宿 7.1 km — because 豪德寺, in Setagaya, was put on a Shinjuku
 * day. Real coordinates throughout.
 */
import { describe, expect, it } from 'vitest';
import { outlierToNearerDay } from './outlierToNearerDay';
import { ItineraryItem } from '../types';

const at = (id: string, date: string, latitude: number, longitude: number, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY',
  date, time: '10:00', durationMinutes: 120, latitude, longitude, ...over,
} as ItineraryItem);

describe('離自己那天太遠的新行程', () => {
  it('搬到明顯比較近的那天', () => {
    const { items, movedCount } = outlierToNearerDay([
      // A Shinjuku day.
      at('shinjuku-garden', '2026-10-21', 35.6852, 139.7101),
      at('shima', '2026-10-21', 35.6883, 139.6809),
      // A Setagaya/Meguro day.
      at('nakameguro', '2026-10-22', 35.6387, 139.7026),
      at('daikanyama', '2026-10-22', 35.6489, 139.6998),
      // The AI put 豪德寺 on the Shinjuku day.
      at('gotokuji', '2026-10-21', 35.6467, 139.6469),
    ], new Set(['gotokuji']));

    expect(items.find(entry => entry.id === 'gotokuji')?.date).toBe('2026-10-22');
    expect(movedCount).toBe(1);
  });

  /*
    His actual plan: 豪德寺 is 7 km from its own day and still nearer to it than
    to 淺草 or 港區. A place with nowhere better to be stays where it is — the
    rule tidies a plan, it does not churn one.
  */
  it('沒有更近的那天就留著不動', () => {
    const { movedCount } = outlierToNearerDay([
      at('shinjuku-garden', '2026-10-21', 35.6852, 139.7101),
      at('shima', '2026-10-21', 35.6883, 139.6809),
      at('asakusa', '2026-10-22', 35.7148, 139.7967),
      at('kitte', '2026-10-23', 35.6795, 139.7649),
      at('gotokuji', '2026-10-21', 35.6467, 139.6469),
    ], new Set(['gotokuji']));

    expect(movedCount).toBe(0);
  });

  it('本來就在對的那天不會被動', () => {
    const { movedCount } = outlierToNearerDay([
      at('asakusa', '2026-10-22', 35.7148, 139.7967),
      at('kaminarimon', '2026-10-22', 35.7101, 139.7967),
      at('new', '2026-10-22', 35.7119, 139.7936),
    ], new Set(['new']));

    expect(movedCount).toBe(0);
  });

  /* The traveller's own arrangement is theirs. */
  it('不動不是這次新增的項目', () => {
    const { movedCount } = outlierToNearerDay([
      at('shinjuku-garden', '2026-10-21', 35.6852, 139.7101),
      at('shima', '2026-10-21', 35.6883, 139.6809),
      at('nakameguro', '2026-10-22', 35.6387, 139.7026),
      at('daikanyama', '2026-10-22', 35.6489, 139.6998),
      at('mine', '2026-10-21', 35.6467, 139.6469),
    ], new Set(['something-else']));

    expect(movedCount).toBe(0);
  });

  /*
    An airport sixty kilometres out would otherwise drag its day's centre
    towards itself and make every real stop look like the outlier.
  */
  it('航班不列入某一天的重心', () => {
    const { movedCount } = outlierToNearerDay([
      at('narita', '2026-10-24', 35.7720, 140.3929, { type: 'FLIGHT' }),
      at('shibuya', '2026-10-24', 35.6580, 139.7016),
      at('new-shibuya', '2026-10-24', 35.6595, 139.7005),
    ], new Set(['new-shibuya']));

    expect(movedCount).toBe(0);
  });

  it('那天只有它自己時不判斷', () => {
    const { movedCount } = outlierToNearerDay([
      at('alone', '2026-10-21', 35.6467, 139.6469),
      at('other-day', '2026-10-22', 35.6580, 139.7016),
    ], new Set(['alone']));

    expect(movedCount).toBe(0);
  });
});
