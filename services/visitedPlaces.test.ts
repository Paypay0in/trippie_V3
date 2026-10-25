/**
 * 「收藏的筆記中，若某次旅行有去過。要記錄：去的時間，並標註『已訪』」.
 */
import { describe, expect, it } from 'vitest';
import { visitLabel, visitOf, visitsByPlace } from './visitedPlaces';
import { Category, Expense, ItineraryItem, SavedTravelInspiration, Trip } from '../types';

const TODAY = '2026-10-14';

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i', title: '', location: '', notes: '', type: 'ACTIVITY',
  date: '2026-03-22', time: '10:00', ...over,
} as ItineraryItem);

const trip = (name: string, itinerary: ItineraryItem[]): Pick<Trip, 'name' | 'itinerary'> =>
  ({ name, itinerary });

const saved = (over: Partial<SavedTravelInspiration>): SavedTravelInspiration =>
  ({ placeName: '', ...over } as SavedTravelInspiration);

describe('已訪的地點', () => {
  it('認得同一個 Google 地點，不管名字怎麼寫', () => {
    const visits = visitsByPlace(
      [trip('東京 2026 春', [item({ placeId: 'ChIJx', location: 'らぁ麺や 嶋' })])],
      TODAY,
    );

    const visit = visitOf(saved({ placeId: 'ChIJx', placeName: '嶋' }), visits);
    expect(visit?.date).toBe('2026-03-22');
    expect(visit?.tripName).toBe('東京 2026 春');
  });

  /* A place saved before it was ever resolved has only its name to match on. */
  it('沒有地圖 id 時用名字比對，大小寫與空白不算差異', () => {
    const visits = visitsByPlace([trip('釜山', [item({ location: ' Photowave ' })])], TODAY);

    expect(visitOf(saved({ placeName: 'photowave' }), visits)?.date).toBe('2026-03-22');
  });

  /* 「去的時間」 — the most recent one, when there are several. */
  it('去過好幾次時留最近的一次', () => {
    const visits = visitsByPlace([
      trip('第一次', [item({ id: 'a', placeId: 'ChIJx', date: '2025-05-02' })]),
      trip('第二次', [item({ id: 'b', placeId: 'ChIJx', date: '2026-03-22' })]),
    ], TODAY);

    const visit = visitOf(saved({ placeId: 'ChIJx' }), visits);
    expect(visit?.date).toBe('2026-03-22');
    expect(visit?.tripName).toBe('第二次');
  });

  /*
    A plan is not a visit. The Tokyo trip on screen runs 10/20–10/24 and is
    still ahead; marking those places 「已訪」 would be the app telling the
    traveller they have been somewhere they have not.
  */
  it('還沒到的日子不算去過', () => {
    const visits = visitsByPlace(
      [trip('東京', [item({ placeId: 'ChIJx', date: '2026-10-22' })])],
      TODAY,
    );

    expect(visitOf(saved({ placeId: 'ChIJx' }), visits)).toBeUndefined();
  });

  it('今天還沒過完，也不算', () => {
    const visits = visitsByPlace([trip('東京', [item({ placeId: 'ChIJx', date: TODAY })])], TODAY);

    expect(visitOf(saved({ placeId: 'ChIJx' }), visits)).toBeUndefined();
  });

  it('沒去過的就是沒去過', () => {
    expect(visitOf(saved({ placeName: 'Levain' }), visitsByPlace([], TODAY))).toBeUndefined();
    expect(visitLabel(undefined)).toBe('');
  });

  /* 「去過的要標記🏷️ 並寫下旅行年份」 — the year, not the day. */
  it('標籤寫出旅行年份', () => {
    expect(visitLabel({ date: '2026-03-22' })).toBe('已訪 · 2026');
  });
});

/**
 * 「去過的要標記」, sent over a 釜山 collection with no 已訪 anywhere on it.
 *
 * The old key took the Google id when there was one and the name otherwise, so
 * a saved place that had been through the backfill and an itinerary item that
 * never was produced two different keys for the same restaurant.
 */
describe('同一個地方的兩種身份', () => {
  const trip = {
    name: '釜山',
    itinerary: [
      { id: 'i1', date: '2026-03-22', title: '海雲台傳統市場', location: '海雲台傳統市場' },
    ],
  } as never;

  it('matches a resolved save against an unresolved itinerary item', () => {
    const visits = visitsByPlace([trip], '2026-10-18');

    expect(visitOf(
      { placeId: 'ChIJ-market', placeName: '海雲台傳統市場' } as never,
      visits,
    )?.date).toBe('2026-03-22');
  });

  it('matches the other way round too', () => {
    const resolvedTrip = {
      name: '釜山',
      itinerary: [
        { id: 'i1', date: '2026-03-22', placeId: 'ChIJ-market', title: '海雲台傳統市場', location: '海雲台傳統市場' },
      ],
    } as never;
    const visits = visitsByPlace([resolvedTrip], '2026-10-18');

    expect(visitOf({ placeName: '海雲台傳統市場' } as never, visits)?.date).toBe('2026-03-22');
  });

  /* A different place with no shared identity still matches nothing. */
  it('does not match a place that was never on a trip', () => {
    const visits = visitsByPlace([trip], '2026-10-18');

    expect(visitOf({ placeName: 'DIART coffee' } as never, visits)).toBeUndefined();
  });
});

/**
 * 「這個點 是我收藏的 我也有安排入行程。若按完成 我希望我點回我的收藏清單 可以看到
 * 他被標註已訪」.
 *
 * The date rule answers 「has this day been and gone」, which is right for a
 * plan nobody has touched and wrong once somebody has said they went.
 */
describe('a stop that was ticked 完成', () => {
  const TODAY = '2026-10-21';
  const trip = (over: Partial<ItineraryItem> = {}) => ([{
    name: '東京',
    itinerary: [{
      id: 'it', date: TODAY, title: '待乳山聖天', location: '待乳山聖天',
      placeId: 'ChIJ-matsuchi', notes: '', type: 'ACTIVITY',
      ...over,
    }],
  }] as unknown as Array<Pick<Trip, 'name' | 'itinerary'>>);

  it('counts today, once it is ticked', () => {
    const visits = visitsByPlace(trip({ isCompleted: true }), TODAY);

    expect(visits.get('place:ChIJ-matsuchi')?.date).toBe(TODAY);
  });

  /* An untouched plan for today is still a plan. */
  it('does not count today while it is only planned', () => {
    const visits = visitsByPlace(trip(), TODAY);

    expect(visits.get('place:ChIJ-matsuchi')).toBeUndefined();
  });

  /* A stop still to come, ticked, is the traveller saying they went. */
  it('counts a ticked stop on a later day too', () => {
    const visits = visitsByPlace(trip({ date: '2026-10-23', isCompleted: true }), TODAY);

    expect(visits.get('place:ChIJ-matsuchi')?.date).toBe('2026-10-23');
  });

  it('still counts a past stop nobody ticked', () => {
    const visits = visitsByPlace(trip({ date: '2026-10-19' }), TODAY);

    expect(visits.get('place:ChIJ-matsuchi')?.date).toBe('2026-10-19');
  });
});

/**
 * 「已訪太少了吧 有缺」.
 *
 * This answered two questions — 「did a trip take you there」 and 「did you say
 * so」 — and ignored the third, which is the most certain of the three:
 * somebody who paid at a place was standing in it.
 */
describe('一筆帳就是一次造訪', () => {
  const today = '2026-10-25';
  const bill = (over: Partial<Expense> = {}): Expense => ({
    id: 'e1', description: '壽司', amount: 4000, twdAmount: 965, currency: 'JPY',
    exchangeRate: 0.24, category: Category.FOOD, phase: 'during', date: '2026-10-22',
    payerId: 'me', beneficiaries: [], splitMethod: 'EQUAL', splitAllocations: {},
    merchantPlaceId: 'g-sushi', ...over,
  } as Expense);

  it('marks the place the money went through', () => {
    const visits = visitsByPlace([], today, {}, [bill()]);

    expect(visits.get('place:g-sushi')?.date).toBe('2026-10-22');
  });

  /*
    Only a stated `merchantPlaceId`. A bill matched by merchant name is right
    for 「what did this place cost」 and too loose for 「was I here」: a
    near-miss there shows a number beside the wrong shop, and a near-miss
    here writes 已訪 onto a restaurant somebody has never been to.
  */
  it('ignores a bill that names no place', () => {
    expect(visitsByPlace([], today, {}, [bill({ merchantPlaceId: undefined })]).size).toBe(0);
    expect(visitsByPlace([], today, {}, [bill({ merchantPlaceId: '  ' })]).size).toBe(0);
    expect(visitsByPlace([], today, {}, [bill({ date: '' })]).size).toBe(0);
  });

  /* 「上次去是什麼時候」 is about the last time. */
  it('keeps the most recent of several bills', () => {
    const visits = visitsByPlace([], today, {}, [
      bill({ id: 'e1', date: '2026-10-20' }),
      bill({ id: 'e2', date: '2026-10-23' }),
    ]);

    expect(visits.get('place:g-sushi')?.date).toBe('2026-10-23');
  });

  /* A trip still wins over a tick, and a bill is not a tick. */
  it('does not overwrite what a trip recorded later', () => {
    const trips = [{
      name: '東京', itinerary: [{
        id: 'i1', time: '', title: '壽司', location: '壽司', notes: '', type: 'FOOD',
        placeId: 'g-sushi', date: '2026-10-24',
      } as ItineraryItem],
    }];

    expect(visitsByPlace(trips, today, {}, [bill()]).get('place:g-sushi')?.date)
      .toBe('2026-10-24');
  });
})
