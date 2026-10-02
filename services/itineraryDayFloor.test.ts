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
import { earliestFreeStartByDate, fixedAnchorSchedule, isCoveredByFixedSchedule, latestFreeStartByDate } from './itineraryDayFloor';
import { normalizeTripInspirationProposal } from './itineraryPlanningService';
import { TripPlanningInput } from './tripInspirationSelection';
import { ItineraryItem } from '../types';

const DAY_ONE = '2026-10-02';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', time: '09:00', title: '', location: '', notes: '', type: 'ACTIVITY', date: DAY_ONE, ...over,
});

/*
  Day 1 exactly as his phone showed it, built the way the app builds it: the ids
  are the ones flightDerivedItems generates, and check-in is a HOTEL item marked
  `accommodation` with an id of its own — it is not derived from the anchor.
  A fixture that invents those details proves nothing about the real itinerary.
*/
const anchors: ItineraryItem[] = [
  item({ id: 'flight-arrival-f1', time: '14:35', title: '抵達機場', location: '桃園國際機場', type: 'TRANSPORT', derivedFromFlightAnchorId: 'f1', durationMinutes: 0 }),
  item({ id: 'flight-departure-f1', time: '16:35', title: '航班起飛', location: '桃園國際機場', type: 'FLIGHT', derivedFromFlightAnchorId: 'f1', durationMinutes: 0 }),
  item({ id: 'flight-landing-f1', time: '19:55', title: '航班抵達', location: '金海國際機場', type: 'FLIGHT', derivedFromFlightAnchorId: 'f1', durationMinutes: 0 }),
  item({ id: 'stay-1', time: '21:55', title: '入住 廣安里凱星頓特酒店', type: 'HOTEL', fixedEventKind: 'accommodation' }),
];

describe('一天最早能開始的時間', () => {
  it('落地、轉車、入住之後才有自由時間', () => {
    expect(earliestFreeStartByDate(fixedAnchorSchedule(anchors))[DAY_ONE]).toBe('21:55');
  });

  it('航班有飛行時間時，floor 要算到降落為止', () => {
    const inFlight = [item({ id: 'flight-landing-f9', time: '16:35', title: '台北 → 釜山', type: 'FLIGHT', derivedFromFlightAnchorId: 'f9', durationMinutes: 200 })];

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

/**
 * The day home has the same shape as the day out — be at the airport, take off,
 * land — so a floor built from "the last unmovable thing that day" pushed the
 * entire last morning to after the plane had gone. Same absurdity, other
 * direction. The free window on that day is before they leave, not after.
 */
describe('回程那天', () => {
  const RETURN_DAY = '2026-10-07';
  const roundTrip = [
    ...anchors,
    item({ id: 'flight-arrival-f2', date: RETURN_DAY, time: '07:00', title: '抵達機場（金海）', type: 'TRANSPORT', derivedFromFlightAnchorId: 'f2' }),
    item({ id: 'flight-departure-f2', date: RETURN_DAY, time: '09:00', title: '航班起飛（金海）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f2' }),
    item({ id: 'flight-landing-f2', date: RETURN_DAY, time: '10:40', title: '航班抵達（桃園）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f2' }),
  ];

  it('回程不產生下限，不會把最後一個早上推到飛機飛走之後', () => {
    expect(earliestFreeStartByDate(fixedAnchorSchedule(roundTrip))[RETURN_DAY]).toBeUndefined();
  });

  it('回程改成上限：要到機場之前才有時間', () => {
    expect(latestFreeStartByDate(fixedAnchorSchedule(roundTrip))[RETURN_DAY]).toBe('07:00');
  });

  it('去程那天的下限不受回程影響', () => {
    expect(earliestFreeStartByDate(fixedAnchorSchedule(roundTrip))[DAY_ONE]).toBe('21:55');
  });

  it('去程那天沒有上限——落地之後的晚上是自由的', () => {
    expect(latestFreeStartByDate(fixedAnchorSchedule(roundTrip))[DAY_ONE]).toBeUndefined();
  });

  it('中途轉機那天同時有下限與上限', () => {
    const transit = [
      item({ id: 'flight-landing-f3', date: '2026-10-04', time: '11:00', title: '航班抵達（濟州）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f3' }),
      item({ id: 'flight-arrival-f4', date: '2026-10-04', time: '18:00', title: '抵達機場（濟州）', type: 'TRANSPORT', derivedFromFlightAnchorId: 'f4' }),
      item({ id: 'flight-departure-f4', date: '2026-10-04', time: '20:00', title: '航班起飛（濟州）', type: 'FLIGHT', derivedFromFlightAnchorId: 'f4' }),
      ...roundTrip,
    ];
    const schedule = fixedAnchorSchedule(transit);

    expect(earliestFreeStartByDate(schedule)['2026-10-04']).toBe('11:00');
    expect(latestFreeStartByDate(schedule)['2026-10-04']).toBe('18:00');
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

describe('回程那天的提案', () => {
  const RETURN_DAY = '2026-10-07';
  const roundTrip: ItineraryItem[] = [
    ...anchors,
    item({ id: 'flight-arrival-f2', date: RETURN_DAY, time: '07:00', title: '抵達機場', location: '金海國際機場', type: 'TRANSPORT', derivedFromFlightAnchorId: 'f2' }),
    item({ id: 'flight-departure-f2', date: RETURN_DAY, time: '09:00', title: '航班起飛', location: '金海國際機場', type: 'FLIGHT', derivedFromFlightAnchorId: 'f2' }),
    item({ id: 'flight-landing-f2', date: RETURN_DAY, time: '10:40', title: '航班抵達', location: '桃園國際機場', type: 'FLIGHT', derivedFromFlightAnchorId: 'f2' }),
  ];

  const input: TripPlanningInput = {
    destination: '釜山', startDate: DAY_ONE, endDate: RETURN_DAY, durationDays: 6,
    selections: [], fixedSchedule: fixedAnchorSchedule(roundTrip),
  };

  it('早上那個空檔照樣排得進去，而不是被推到飛機飛走之後', () => {
    const { days } = normalizeTripInspirationProposal(
      { days: [{ date: RETURN_DAY, items: [{ placeName: '西面市場買伴手禮', suggestedStartTime: '05:30', durationMinutes: 60, sourceInspirationIds: [] }] }] },
      input,
    );

    expect(days[0]?.items[0]?.suggestedStartTime).toBe('05:30');
  });

  it('排在出發去機場之後的，整天都不留', () => {
    const { days, warnings } = normalizeTripInspirationProposal(
      { days: [{ date: RETURN_DAY, items: [{ placeName: '甘川洞文化村', suggestedStartTime: '13:00', durationMinutes: 90, sourceInspirationIds: [] }] }] },
      input,
    );

    expect(days).toEqual([]);
    expect(warnings.some(warning => warning.includes('出發去機場'))).toBe(true);
  });
});
