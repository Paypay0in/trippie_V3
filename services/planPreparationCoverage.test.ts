import { describe, expect, it } from 'vitest';
import { missingPreparation, withRequiredPreparation } from './planPreparationCoverage';

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
