/**
 * 「那 AI 要像一個規劃人員重新幫我想行程 動線才對」 and 「連我手排的都給建議才對 除非
 * 我按下固定的行程」.
 *
 * His own three days, with the coordinates measured off the live route.
 */
import { describe, expect, it } from 'vitest';
import { isAnchored, mealsAtMealtimesByDay, optimiseTripRoute, orderByProximity } from './optimiseTripRoute';
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
    const stay = at('stay', '2026-10-21', ...SHINJUKU, { type: 'HOTEL' });

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

    /*
      11:00, 90 minutes, then the journey to the next stop — 「你這到底怎規劃
      的」. Back to back was the bug: the app's own leg card said the drive took
      62 minutes while the plan gave it none.
    */
    const times = plan.days[0].items.map(item => item.time);
    expect(times[0]).toBe('11:00');
    expect(times[1] > '12:30').toBe(true);
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

/**
 * 「動線被優化了 但是行程合理性沒有驗證。早上10點吃拉麵嗎？」
 *
 * His own day: らぁ麺や 嶋 opened it at 10:00 because the route was laid out by
 * distance and the clock was filled in behind it. Walking least is not the only
 * thing a day has to be.
 */
describe('餐廳要排在吃飯時間', () => {
  const foodIds = new Set(['ramen']);
  const categoryOf = (item: ItineraryItem) => (foodIds.has(item.id) ? 'food' : 'sight');

  it('把 10 點的拉麵跟午餐時段的景點對調', () => {
    const plan = optimiseTripRoute([
      at('ramen', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
      at('garden', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 120 }),
      at('gotokuji', '2026-10-22', 35.6467, 139.6469, { durationMinutes: 60 }),
    ], { country: '日本', dayStart: '10:00', categoryOf });

    const ramen = plan.days[0].items.find(item => item.id === 'ramen');
    const minutes = Number(ramen!.time.slice(0, 2)) * 60 + Number(ramen!.time.slice(3));
    // 午餐 is 11:30–14:00 in this app's own template.
    expect(minutes).toBeGreaterThanOrEqual(11 * 60 + 30);
    expect(minutes).toBeLessThan(14 * 60);
  });

  /* The set of stops and the day they are on never change — only two clocks. */
  it('只是對調時間，不會多也不會少一個行程', () => {
    const day = [
      at('ramen', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
      at('garden', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 120 }),
    ];
    const plan = optimiseTripRoute(day, { country: '日本', dayStart: '10:00', categoryOf });

    expect(plan.days[0].items.map(item => item.id).sort()).toEqual(['garden', 'ramen']);
  });

  /* Already eating at a sensible hour: leave it completely alone. */
  it('本來就在吃飯時間的不動', () => {
    const plan = optimiseTripRoute([
      at('garden', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 90 }),
      at('ramen', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
    ], { country: '日本', dayStart: '10:30', categoryOf });

    // 10:30 + 90 minutes + the journey, which is still inside 午餐.
    const ramen = plan.days[0].items.find(item => item.id === 'ramen')!.time;
    expect(ramen >= '11:30' && ramen < '14:00').toBe(true);
  });

  /* No tag, no opinion: a day of untagged places is laid out as before. */
  it('沒有標籤時行為跟以前一樣', () => {
    const plan = optimiseTripRoute([
      at('a', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
      at('b', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 120 }),
    ], { country: '日本', dayStart: '10:00' });

    expect(plan.days[0].items[0].time).toBe('10:00');
  });
});

/**
 * 「航班起飛還沒抵達就去美術館嗎？」
 *
 * His outbound is 2026/10/20 06:35 → 11:00, and the optimiser opened that day
 * at 10:00 — in the air. It laid times from a constant and never asked what
 * bounded the day, while `earliestFreeStartByDate` had been answering exactly
 * that question all evening for the day template and the AI planner.
 */
describe('抵達之前的那一天', () => {
  it('不會把行程排在落地之前', () => {
    const arrivalDay = [
      {
        /*
          The id is the role: `flightDerivedItems` builds `flight-landing-<id>`,
          and `roleOf` reads it, because an id is the one part of these items
          that is generated rather than typed.
        */
        id: 'flight-landing-anchor-out', title: '航班抵達', location: 'Narita International Airport',
        notes: '', type: 'FLIGHT', date: '2026-10-20', time: '11:00',
        durationMinutes: 0, latitude: 35.7720, longitude: 140.3929,
        derivedFromFlightAnchorId: 'anchor-out',
      } as ItineraryItem,
      at('museum', '2026-10-20', 35.6797, 139.8003, { durationMinutes: 60 }),
      at('cafe', '2026-10-20', 35.6659, 139.7105, { durationMinutes: 60 }),
    ];

    const plan = optimiseTripRoute(arrivalDay, { country: '日本', dayStart: '10:00' });

    plan.days.flatMap(day => day.items).forEach(item => {
      expect(item.time >= '11:00').toBe(true);
    });
  });

  /* A day with no flight keeps the time the traveller asked for. */
  it('沒有航班的那天照常從設定的時間開始', () => {
    const plan = optimiseTripRoute([
      at('a', '2026-10-22', 35.6852, 139.7101),
      at('b', '2026-10-22', 35.6883, 139.6809),
    ], { country: '日本', dayStart: '09:00' });

    expect(plan.days[0].items[0].time).toBe('09:00');
  });
});

/**
 * 「吃飯時間也要規劃餐廳 不是塞景點」.
 *
 * The first version only traded places, so a day whose lunch hour had nothing
 * in it left the restaurant at 15:00 and ate nothing at noon. An empty window
 * is the easiest case, not the hardest.
 */
describe('用餐時段空著的時候', () => {
  const foodIds = new Set(['ramen']);
  const categoryOf = (item: ItineraryItem) => (foodIds.has(item.id) ? 'food' : 'sight');

  it('直接把餐廳移進空的用餐時段', () => {
    const plan = optimiseTripRoute([
      at('garden', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 180 }),
      at('ramen', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
    ], { country: '日本', dayStart: '10:00', categoryOf });

    const ramen = plan.days[0].items.find(item => item.id === 'ramen')!.time;
    expect(ramen >= '11:30' && ramen < '14:00').toBe(true);
  });

  /*
    A window that has already passed is not used to reach back into a time the
    traveller was not in the country.
  */
  it('那天還沒開始的時段不算數', () => {
    const plan = optimiseTripRoute([
      at('garden', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 120 }),
      at('ramen', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
    ], { country: '日本', dayStart: '15:00', categoryOf });

    // 早餐 and 午餐 are both behind a day that opens at 15:00.
    expect(plan.days[0].items.find(item => item.id === 'ramen')!.time >= '15:00').toBe(true);
  });

  /* Two meals, two windows: each finds its own rather than fighting over one. */
  it('兩間餐廳分別落在午餐與晚餐', () => {
    const twoMeals = new Set(['lunch', 'dinner']);
    const plan = optimiseTripRoute([
      at('sight', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 120 }),
      at('lunch', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
      at('dinner', '2026-10-22', 35.6860, 139.7020, { durationMinutes: 60 }),
    ], {
      country: '日本',
      dayStart: '09:00',
      categoryOf: (item) => (twoMeals.has(item.id) ? 'food' : 'sight'),
    });

    const times = plan.days[0].items
      .filter(item => twoMeals.has(item.id))
      .map(item => item.time)
      .sort();
    expect(times[0]).not.toBe(times[1]);
  });
});

/**
 * 「吃飯時間也要規劃餐廳」 — and when there is no restaurant to move, say so
 * rather than leaving the day quietly without lunch.
 */
describe('那天沒有餐廳的時候', () => {
  const allSights = () => 'sight';

  it('講出哪幾餐沒安排', () => {
    const plan = optimiseTripRoute([
      at('a', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 120 }),
      at('b', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 120 }),
    ], { country: '日本', dayStart: '10:00', categoryOf: allSights });

    expect(plan.mealsMissing.some(entry => entry.label === '午餐')).toBe(true);
  });

  /* A window the day never reaches was not missed. */
  it('那天到不了的時段不算沒安排', () => {
    const plan = optimiseTripRoute([
      at('a', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 60 }),
    ], { country: '日本', dayStart: '10:00', categoryOf: allSights });

    expect(plan.mealsMissing.some(entry => entry.label === '晚餐')).toBe(false);
  });

  it('有餐廳的那一餐不會被列出來', () => {
    const plan = optimiseTripRoute([
      at('sight', '2026-10-22', 35.6852, 139.7101, { durationMinutes: 90 }),
      at('lunch', '2026-10-22', 35.6883, 139.6809, { durationMinutes: 60 }),
    ], {
      country: '日本', dayStart: '10:00',
      categoryOf: (item) => (item.id === 'lunch' ? 'food' : 'sight'),
    });

    expect(plan.mealsMissing.some(entry => entry.label === '午餐')).toBe(false);
  });
});

/**
 * 「13:00 前往朋友家 / 13:00 東京都現代美術館」, both cards warning about the other.
 *
 * The airport transfer is an anchor. This function steps over anchors when it
 * lays the clock and then never checked whether what it laid had landed on
 * one — while a comment in it already promised `separateOverlaps` would settle
 * exactly that. A promise in a comment is not a behaviour.
 */
describe('排好的行程不會壓到固定項目', () => {
  it('不會跟機場接送同一個時間', () => {
    const transfer = {
      id: 'flight-arrival-out', title: '前往 朋友家', location: '朋友家',
      notes: '', type: 'TRANSPORT', date: '2026-10-20', time: '13:00',
      durationMinutes: 60, latitude: 35.7040, longitude: 139.7930,
      derivedFromFlightAnchorId: 'anchor-out',
    } as ItineraryItem;

    const plan = optimiseTripRoute(
      [transfer, at('museum', '2026-10-20', 35.6797, 139.8003, { durationMinutes: 60 })],
      { country: '日本', dayStart: '13:00' },
    );

    const museum = plan.days.flatMap(day => day.items).find(item => item.id === 'museum');
    // The transfer runs 13:00–14:00 and never moves.
    expect(museum!.time >= '14:00').toBe(true);
  });
});

/**
 * 「早上有壽司很奇怪」.
 *
 * 迴轉壽司 根室花丸 KITTE丸之內店 opened his Day 4 at 10:00 — the same complaint
 * as 「早上10點吃拉麵嗎？」, and the same cause: this rule lived inside 優化動線
 * and the AI adjustment never reached it.
 */
describe('mealsAtMealtimesByDay', () => {
  const day = (id: string, date: string, time: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
    id, title: id, location: id, notes: '', type: 'ACTIVITY', date, time,
    durationMinutes: 60, ...over,
  } as ItineraryItem);

  const tags: Record<string, string> = { sushi: 'food', temple: 'sight', museum: 'sight' };
  const categoryOf = (item: ItineraryItem) => tags[item.id];

  it('moves a 10:00 restaurant into a mealtime', () => {
    const result = mealsAtMealtimesByDay([
      day('sushi', '2026-10-23', '10:00'),
      day('temple', '2026-10-23', '12:00'),
    ], categoryOf);

    const sushi = result.find(item => item.id === 'sushi') as ItineraryItem;
    expect(sushi.time).toBe('12:00');
  });

  /* Each day on its own: a swap across days would move a stop off its date. */
  it('never trades times between two days', () => {
    const result = mealsAtMealtimesByDay([
      day('sushi', '2026-10-23', '10:00'),
      day('temple', '2026-10-24', '12:00'),
    ], categoryOf);

    expect(result.find(item => item.id === 'sushi')?.date).toBe('2026-10-23');
    expect(result.find(item => item.id === 'temple')?.time).toBe('12:00');
  });

  /* A swap must never move the thing the day is built around. */
  it('leaves a fixed item where it is', () => {
    const result = mealsAtMealtimesByDay([
      day('sushi', '2026-10-23', '10:00'),
      day('museum', '2026-10-23', '12:00', { isPinned: true }),
    ], categoryOf, item => item.isPinned === true);

    expect(result.find(item => item.id === 'museum')?.time).toBe('12:00');
    // With nobody to trade with, the meal takes an empty window of its own —
    // dinner — rather than displacing the pin.
    expect(result.find(item => item.id === 'sushi')?.time).toBe('17:30');
  });

  it('leaves a day that is already sensible untouched', () => {
    const items = [day('sushi', '2026-10-23', '12:00'), day('temple', '2026-10-23', '15:00')];

    expect(mealsAtMealtimesByDay(items, categoryOf)).toBe(items);
  });
});
