/**
 * 「那 AI 要像一個規劃人員重新幫我想行程 動線才對」 and 「連我手排的都給建議才對 除非
 * 我按下固定的行程」.
 *
 * His own three days, with the coordinates measured off the live route.
 */
import { describe, expect, it } from 'vitest';
import { isAnchored, optimiseTripRoute, orderByProximity } from './optimiseTripRoute';
import { ItineraryItem } from '../types';

const at = (id: string, date: string, latitude: number, longitude: number, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, location: id, notes: '', type: 'ACTIVITY',
  date, time: '10:00', durationMinutes: 120, latitude, longitude, ...over,
} as ItineraryItem);

/* 淺草 / 新宿 / 世田谷 / 目黑, as on his plan. */
const ASAKUSA = [35.7148, 139.7967] as const;
const ASAKUSA2 = [35.7119, 139.7936] as const;
const SHINJUKU = [35.6852, 139.7101] as const;
const SHINJUKU2 = [35.6883, 139.6809] as const;
const GOTOKUJI = [35.6467, 139.6469] as const;
const NAKAMEGURO = [35.6387, 139.7026] as const;

describe('整趟重排動線', () => {
  it('把散在各天的同一區收在一起，而且走得更短', () => {
    const scrambled = [
      at('asakusa-1', '2026-10-21', ...ASAKUSA),
      at('gotokuji', '2026-10-21', ...GOTOKUJI),
      at('shinjuku-1', '2026-10-22', ...SHINJUKU),
      at('asakusa-2', '2026-10-22', ...ASAKUSA2),
      at('shinjuku-2', '2026-10-23', ...SHINJUKU2),
      at('nakameguro', '2026-10-23', ...NAKAMEGURO),
    ];

    const plan = optimiseTripRoute(scrambled, { country: '日本' });

    const dayOf = (id: string) => plan.days.find(day => day.items.some(item => item.id === id))?.date;
    expect(dayOf('asakusa-1')).toBe(dayOf('asakusa-2'));
    expect(dayOf('shinjuku-1')).toBe(dayOf('shinjuku-2'));
    expect(plan.afterKm).toBeLessThan(plan.beforeKm);
  });

  /* 「除非我按下固定的行程 那才是不能動的」 — his own words, his own field. */
  it('釘住的、航班、入住都不會被重排', () => {
    const pinned = at('pinned', '2026-10-21', ...GOTOKUJI, { isPinned: true });
    const flight = at('flight', '2026-10-24', 35.7720, 140.3929, { type: 'FLIGHT' });
    const stay = at('stay', '2026-10-21', ...SHINJUKU, { accommodation: true });

    [pinned, flight, stay].forEach(item => expect(isAnchored(item)).toBe(true));

    const plan = optimiseTripRoute(
      [pinned, flight, stay, at('free', '2026-10-21', ...ASAKUSA)],
      { country: '日本' },
    );

    const planned = plan.days.flatMap(day => day.items).map(item => item.id);
    expect(planned).not.toContain('pinned');
    expect(planned).not.toContain('flight');
    expect(planned).toContain('free');
  });

  /* Already sensible plans are left alone rather than reshuffled for its own sake. */
  it('本來就合理的安排不會被打亂', () => {
    const tidy = [
      at('a', '2026-10-21', ...ASAKUSA),
      at('b', '2026-10-21', ...ASAKUSA2),
      at('c', '2026-10-22', ...SHINJUKU),
      at('d', '2026-10-22', ...SHINJUKU2),
    ];

    const plan = optimiseTripRoute(tidy, { country: '日本' });
    const dayOf = (id: string) => plan.days.find(day => day.items.some(item => item.id === id))?.date;

    expect(dayOf('a')).toBe('2026-10-21');
    expect(dayOf('c')).toBe('2026-10-22');
  });

  it('每一筆都拿到時間，而且一天之內依序往後', () => {
    const plan = optimiseTripRoute([
      at('a', '2026-10-21', ...ASAKUSA, { durationMinutes: 90 }),
      at('b', '2026-10-21', ...ASAKUSA2, { durationMinutes: 60 }),
    ], { country: '日本', dayStart: '11:00' });

    const times = plan.days[0].items.map(item => item.time);
    expect(times).toEqual(['11:00', '12:30']);
  });

  /* A place with no coordinates cannot be routed, and says so. */
  it('沒有地圖位置的說明原因，不會被默默丟掉', () => {
    const plan = optimiseTripRoute([
      at('a', '2026-10-21', ...ASAKUSA),
      { id: 'nowhere', title: '朋友說的那家', location: '朋友說的那家', notes: '', type: 'ACTIVITY', date: '2026-10-21', time: '', durationMinutes: 60 } as ItineraryItem,
    ], { country: '日本' });

    expect(plan.unplaced.map(entry => entry.item.id)).toEqual(['nowhere']);
    expect(plan.unplaced[0].reason).toContain('地圖位置');
  });
});

describe('一天之內的順序', () => {
  it('從住宿出發，一路挑最近的下一站', () => {
    const ordered = orderByProximity([
      at('far', '2026-10-21', ...GOTOKUJI),
      at('near', '2026-10-21', ...SHINJUKU2),
    ], { latitude: SHINJUKU[0], longitude: SHINJUKU[1] });

    expect(ordered.map(item => item.id)).toEqual(['near', 'far']);
  });
});

/**
 * The case that caught the worst bug in this file: four areas, three days, and
 * the fourth area had no day and vanished from the plan entirely. An algorithm
 * that loses a place the traveller chose is worse than one that routes badly.
 */
describe('區比天數多的時候', () => {
  it('一個地點都不會消失', () => {
    const everywhere = [
      at('asakusa', '2026-10-21', ...ASAKUSA),
      at('shinjuku', '2026-10-21', ...SHINJUKU),
      at('gotokuji', '2026-10-22', ...GOTOKUJI),
      at('nakameguro', '2026-10-22', ...NAKAMEGURO),
      at('asakusa-2', '2026-10-22', ...ASAKUSA2),
      at('shinjuku-2', '2026-10-21', ...SHINJUKU2),
    ];

    const plan = optimiseTripRoute(everywhere, { country: '日本' });
    const planned = plan.days.flatMap(day => day.items).map(item => item.id).sort();

    expect(planned).toEqual(everywhere.map(item => item.id).sort());
  });

  /* And the leftover area joins the day it is nearest to, not the first one. */
  it('落單的區併到離它最近的那天', () => {
    const plan = optimiseTripRoute([
      at('asakusa', '2026-10-21', ...ASAKUSA),
      at('asakusa-2', '2026-10-21', ...ASAKUSA2),
      at('shinjuku', '2026-10-22', ...SHINJUKU),
      at('shinjuku-2', '2026-10-22', ...SHINJUKU2),
      // Setagaya has no day of its own, and is far nearer to 新宿 than to 淺草.
      at('gotokuji', '2026-10-21', ...GOTOKUJI),
    ], { country: '日本' });

    const dayOf = (id: string) => plan.days.find(day => day.items.some(item => item.id === id))?.date;
    expect(dayOf('gotokuji')).toBe(dayOf('shinjuku'));
  });
});
