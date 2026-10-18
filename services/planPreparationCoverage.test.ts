import { describe, expect, it } from 'vitest';
import { markDepartureTiming, missingPreparation, tripHasStarted, withRequiredPreparation } from './planPreparationCoverage';

const drivingPlan = [
  { title: '東京都心租車出發', notes: '建議選擇配備 ETC 讀卡機的車型以節省收費站時間。' },
  { title: '城之島公園漫步', placeName: '城之島公園' },
  { title: '三崎港鮪魚風味料理', placeName: '三崎港' },
];

describe('preparation the schedule requires', () => {
  it('spots a plan that drives away in a car nobody booked', () => {
    // The observed case: the day opens by collecting a rental car, and the
    // preparation list mentions the licence and the restaurant but never the
    // car itself.
    const preparation = [
      { name: '辦理台灣駕照日文譯本或國際駕照', canBeHumanAssisted: false },
      { name: '預約三崎港熱門海鮮餐廳', canBeHumanAssisted: true },
    ];

    expect(missingPreparation(drivingPlan, preparation)).toEqual([
      { name: '預約租車', canBeHumanAssisted: true },
    ]);
  });

  it('stays quiet when the list already covers it', () => {
    const preparation = [{ name: '預約租車並確認保險', canBeHumanAssisted: true }];
    expect(missingPreparation(drivingPlan, preparation)).toEqual([]);
  });

  it('says nothing about a plan that walks everywhere', () => {
    const walking = [
      { title: '淺草寺參拜', placeName: '淺草寺' },
      { title: '隅田川散步' },
    ];
    expect(missingPreparation(walking, [])).toEqual([]);
  });

  it('reads the notes as well as the titles', () => {
    // The arrangement is often mentioned where the reasoning is, not in the
    // title of the stop it enables.
    const items = [{ title: '前往離島', notes: '需搭乘渡輪，班次有限' }];
    expect(missingPreparation(items, [])).toEqual([
      { name: '確認船班時刻與訂票', canBeHumanAssisted: true },
    ]);
  });

  it('recognises the arrangement written in another language', () => {
    const items = [{ title: 'レンタカーで出発' }];
    expect(missingPreparation(items, [])).toHaveLength(1);
  });

  it('has nothing to say about an empty plan', () => {
    expect(missingPreparation([], [])).toEqual([]);
  });
});

describe('withRequiredPreparation', () => {
  it('puts what the schedule requires first', () => {
    // The derived task comes from what the plan will actually do; the model's
    // are its own reading of the same plan.
    const preparation = [{ name: '辦理國際駕照', canBeHumanAssisted: false }];
    const merged = withRequiredPreparation(drivingPlan, preparation);

    expect(merged[0]).toEqual({ name: '預約租車', canBeHumanAssisted: true });
    expect(merged).toHaveLength(2);
  });

  it('leaves a list that needs nothing exactly as it was', () => {
    const preparation = [{ name: '預約餐廳', canBeHumanAssisted: true }];
    expect(withRequiredPreparation([{ title: '散步' }], preparation)).toEqual(preparation);
  });

  it('keeps the list short enough to be read', () => {
    const preparation = Array.from({ length: 8 }, (_, index) => ({
      name: `準備 ${index}`,
      canBeHumanAssisted: false,
    }));
    const merged = withRequiredPreparation(drivingPlan, preparation);

    expect(merged).toHaveLength(5);
    // The one the plan cannot happen without survives the trim.
    expect(merged[0].name).toBe('預約租車');
  });
});

describe('preparation that can only happen before leaving home', () => {
  it('marks the documents an authority at home has to issue', () => {
    const marked = markDepartureTiming([
      { name: '辦理台灣駕照日文譯本或國際駕照', canBeHumanAssisted: false },
      { name: '預約三崎港熱門海鮮餐廳', canBeHumanAssisted: true },
    ]);

    expect(marked[0].beforeDeparture).toBe(true);
    // Booking a restaurant from abroad is ordinary. Only the impossible is
    // marked, or the mark stops meaning anything.
    expect(marked[1].beforeDeparture).toBeUndefined();
  });

  it('leaves an ordinary list untouched', () => {
    const preparation = [{ name: '查詢纜車時刻', canBeHumanAssisted: true }];
    expect(markDepartureTiming(preparation)).toEqual(preparation);
  });
});

describe('tripHasStarted', () => {
  it('is true from the first day of the trip onwards', () => {
    expect(tripHasStarted('2026-10-20', '2026-10-20')).toBe(true);
    expect(tripHasStarted('2026-10-23', '2026-10-20')).toBe(true);
  });

  it('is false while the trip is still ahead', () => {
    expect(tripHasStarted('2026-10-19', '2026-10-20')).toBe(false);
  });

  it('says nothing when it has nothing to compare', () => {
    // A trip without dates must not be reported as under way: that would
    // warn about preparation nobody has run out of time for.
    expect(tripHasStarted('2026-10-20', undefined)).toBe(false);
    expect(tripHasStarted('2026-10-20', '')).toBe(false);
    expect(tripHasStarted('not-a-date', '2026-10-20')).toBe(false);
  });
});

/**
 * 「若很熱門就要放進去行前規劃中。比方說有些觀光列車是提前一個月要預約的」.
 *
 * A different kind of task from the rest of this list. 「before you leave」 is
 * still weeks away; 「a month before you leave」 may already be today.
 */
describe('觀光列車', () => {
  const schedule = [{ title: '搭乘觀光列車前往山區', placeName: '由布院之森' }];

  it('is added when the schedule names one', () => {
    const added = missingPreparation(schedule, []);

    expect(added.map(task => task.name)).toContain('預約觀光列車座位');
  });

  /* Reservations open exactly one month before departure. */
  it('carries the lead time, which a checkbox cannot say', () => {
    const task = missingPreparation(schedule, [])
      .find(entry => entry.name === '預約觀光列車座位');

    expect(task?.leadTimeDays).toBe(30);
  });

  it('is not added when the list already covers it', () => {
    const added = missingPreparation(schedule, [
      { name: '完成列車訂位', canBeHumanAssisted: true },
    ]);

    expect(added.map(task => task.name)).not.toContain('預約觀光列車座位');
  });

  /* An ordinary train is not this. Nothing is claimed about a local service. */
  it('says nothing about an ordinary train ride', () => {
    const added = missingPreparation([{ title: '搭電車到淺草' }], []);

    expect(added.map(task => task.name)).not.toContain('預約觀光列車座位');
  });

  /* The lead time survives the pass that marks before-departure tasks. */
  it('survives markDepartureTiming', () => {
    const marked = markDepartureTiming(missingPreparation(schedule, []));

    expect(marked.find(task => task.name === '預約觀光列車座位')?.leadTimeDays).toBe(30);
  });
});

/**
 * 「若很熱門就要放進去行前規劃中」, answered the other way round.
 *
 * The keyword rules read the words on a schedule, so they catch the categories
 * somebody thought to list. This reads the place: a venue the commerce
 * catalogue says cannot be walked into is a fact about the venue, whatever it
 * happens to be called.
 */
describe('不先訂就進不去的地點', () => {
  const schedule = [{ title: '下午', placeName: 'teamLab Borderless' }];

  it('adds a task for a place on the schedule', () => {
    const tasks = withRequiredPreparation(schedule, [], 5, [{ name: 'teamLab Borderless' }]);

    expect(tasks.map(task => task.name)).toContain('預訂 teamLab Borderless');
  });

  it('carries a lead time where there is one', () => {
    const tasks = withRequiredPreparation(schedule, [], 5, [{ name: 'teamLab Borderless', leadTimeDays: 14 }]);

    expect(tasks.find(task => task.name.includes('teamLab'))?.leadTimeDays).toBe(14);
  });

  /* A place that is not on this plan is not this plan's problem. */
  it('ignores a place the schedule never visits', () => {
    const tasks = withRequiredPreparation(schedule, [], 5, [{ name: 'SPA LAND Centum City' }]);

    expect(tasks.map(task => task.name)).not.toContain('預訂 SPA LAND Centum City');
  });

  it('does not repeat what the list already covers', () => {
    const tasks = withRequiredPreparation(
      schedule,
      [{ name: '買好 teamLab Borderless 的票', canBeHumanAssisted: true }],
      5,
      [{ name: 'teamLab Borderless' }],
    );

    expect(tasks.filter(task => task.name.includes('teamLab'))).toHaveLength(1);
  });

  /*
    A 觀光列車 keyword and a curated 觀光列車 venue are one task. A list that
    says it twice is a list somebody stops reading.
  */
  it('says each task once', () => {
    const tasks = withRequiredPreparation(
      [{ title: '搭觀光列車', placeName: '預約觀光列車座位' }],
      [],
      5,
      [{ name: '預約觀光列車座位' }],
    );

    expect(tasks.filter(task => task.name === '預約觀光列車座位')).toHaveLength(1);
  });

  /* With nothing supplied, the keyword behaviour is exactly what it was. */
  it('changes nothing when no place is known to need booking', () => {
    const before = withRequiredPreparation([{ title: '租車自駕' }], []);
    const after = withRequiredPreparation([{ title: '租車自駕' }], [], 5, []);

    expect(after).toEqual(before);
  });
});
