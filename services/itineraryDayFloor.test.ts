/**
 * The arrival day cannot start before the plane lands.
 *
 * 「第一天行程非常不合理 且有重複的 怎麼會先入境金浦機場再去桃園機場」. Day 1 of the
 * generated Busan itinerary read, top to bottom:
 *
 *   14:00  抵達金海國際機場並完成入境   ← AI
 *   14:35  抵達機場（桃園）           ← flight anchor
 *   16:00  前往計程車搭乘處            ← AI
 *   16:35  航班起飛（桃園）           ← flight anchor
 *   16:45  抵達飯店門口並辦理入住       ← AI
 *   19:55  航班抵達（金海）           ← flight anchor
 *
 * The planner had been told the trip's dates and nothing else, so it filled the
 * day from the morning: it had them clearing Korean immigration two and a half
 * hours before their plane left Taoyuan, and checking into the hotel while they
 * were still in the air. Three of its six items were also things the anchors
 * already said.
 */
import { describe, expect, it } from 'vitest';
import { earliestFreeStartByDate, fixedAnchorSchedule, isCoveredByFixedSchedule } from './itineraryDayFloor';
import { normalizeTripInspirationProposal } from './itineraryPlanningService';
import { TripPlanningInput } from './tripInspirationSelection';
import { ItineraryItem } from '../types';

const DAY_ONE = '2026-10-02';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '09:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: DAY_ONE, ...over,
});

/** Day 1 exactly as his phone showed it. */
const anchors: ItineraryItem[] = [
  item({ id: 'a-depart-airport', time: '14:35', title: '抵達機場（桃園）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f1', durationMinutes: 0 }),
  item({ id: 'a-takeoff', time: '16:35', title: '航班起飛（桃園）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f1', durationMinutes: 0 }),
  item({ id: 'a-land', time: '19:55', title: '航班抵達（金海）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f1', durationMinutes: 0 }),
  item({ id: 'a-hotel', time: '21:55', title: '入住 廣安里凱星頓特酒店', type: 'HOTEL', derivedFromFlightAnchorId: 'f1' }),
];

describe('一天最早能開始的時間', () => {
  it('落地、轉車、入住之後才有自由時間', () => {
    expect(earliestFreeStartByDate(fixedAnchorSchedule(anchors))[DAY_ONE]).toBe('21:55');
  });

  it('航班有飛行時間時，floor 要算到降落為止', () => {
    const inFlight = [item({ id: 'a', time: '16:35', title: '台北 → 釜山', type: 'FLIGHT', durationMinutes: 200 })];

    expect(earliestFreeStartByDate(fixedAnchorSchedule(inFlight))[DAY_ONE]).toBe('19:55');
  });

  it('沒有航班的日子沒有下限，規劃不受限制', () => {
    const sightseeing = [item({ id: 'a', time: '09:00', title: '甘川洞文化村' })];

    expect(earliestFreeStartByDate(fixedAnchorSchedule(sightseeing))).toEqual({});
  });

  it('只看航班與航班衍生項目，一般行程不構成下限', () => {
    expect(fixedAnchorSchedule([item({ id: 'a', time: '20:00', title: '晚餐', type: 'FOOD' })])).toEqual([]);
  });
});

describe('錨點已經說過的事', () => {
  it('認得出 AI 重複寫的機場、通關與入住項目', () => {
    ['抵達金海國際機場並完成入境', '前往計程車搭乘處', '抵達飯店門口並辦理入住', '桃園機場出境通關', 'Hotel check-in']
      .forEach(name => expect(isCoveredByFixedSchedule(name)).toBe(true));
  });

  it('不會誤殺真正的行程', () => {
    ['廣安里海水浴場', '豬肉湯飯', '甘川洞文化村', '西面市場逛街', '機場免稅店以外的購物行程']
      .forEach(name => expect(isCoveredByFixedSchedule(name)).toBe(false));
  });
});

describe('第一天的提案', () => {
  const input: TripPlanningInput = {
    destination: '釜山',
    destinationCountry: '韓國',
    startDate: DAY_ONE,
    endDate: '2026-10-07',
    durationDays: 6,
    selections: [],
    fixedSchedule: fixedAnchorSchedule(anchors),
  };

  /** What the model actually returned for day 1. */
  const raw = {
    days: [{
      date: DAY_ONE,
      items: [
        { placeName: '抵達金海國際機場並完成入境', suggestedStartTime: '14:00', durationMinutes: 60, sourceInspirationIds: [] },
        { placeName: '前往計程車搭乘處', suggestedStartTime: '16:00', durationMinutes: 30, sourceInspirationIds: [] },
        { placeName: '抵達飯店門口並辦理入住', suggestedStartTime: '16:45', durationMinutes: 30, sourceInspirationIds: [] },
        { placeName: '廣安里海水浴場夜景', suggestedStartTime: '09:00', durationMinutes: 60, sourceInspirationIds: [] },
      ],
    }],
  };

  it('不再重複產生航班與入住已經說過的項目', () => {
    const { days } = normalizeTripInspirationProposal(raw, input);

    expect(days[0].items.map(entry => entry.placeName)).toEqual(['廣安里海水浴場夜景']);
  });

  it('留下來的行程排在入住之後，而不是早上', () => {
    const { days } = normalizeTripInspirationProposal(raw, input);

    expect(days[0].items[0].suggestedStartTime).toBe('21:55');
  });

  it('說出它丟掉了什麼，而不是安靜地改掉', () => {
    const { warnings } = normalizeTripInspirationProposal(raw, input);

    expect(warnings.some(warning => warning.includes('航班與入住'))).toBe(true);
  });

  it('沒有航班資料時，提案照舊原封不動通過', () => {
    const { days } = normalizeTripInspirationProposal(raw, { ...input, fixedSchedule: undefined });

    expect(days[0].items).toHaveLength(4);
  });
});
