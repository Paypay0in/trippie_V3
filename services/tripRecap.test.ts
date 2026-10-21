/**
 * 旅程回顧 — the four counts, the days, and the Top 3.
 *
 * The thing under test is restraint: a review is read long after anybody can
 * check it, so every one of these asserts that an unknown stays unknown. No
 * invented photograph, no rating for a stop nobody rated, no 造訪 for a day
 * that has not happened.
 */
import { describe, expect, it } from 'vitest';
import { buildTripRecap, starsFor } from './tripRecap';
import { Category, Expense, ItineraryItem, PaymentMethod } from '../types';

const TODAY = '2026-10-21';

const stop = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: 'i1', time: '09:00', title: '淺草寺', location: '台東區', notes: '',
  type: 'ACTIVITY', date: '2026-10-18',
  ...over,
});

const bill = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1', description: '黑船亭 洋食料理', amount: 4300, currency: 'JPY',
  exchangeRate: 0.22, twdAmount: 946, category: Category.FOOD,
  paymentMethod: PaymentMethod.CASH_FOREIGN, phase: 'during', date: '2026-10-18',
  payerId: 'me', beneficiaries: ['me'], splitMethod: 'EQUAL',
  splitAllocations: {},
  ...over,
});

const recap = (itinerary: ItineraryItem[], expenses: Expense[] = []) =>
  buildTripRecap({ trip: { itinerary }, expenses, today: TODAY });

describe('the four counts', () => {
  it('counts the days that hold a stop, not the gaps between them', () => {
    const built = recap([
      stop({ id: 'a', date: '2026-10-18' }),
      stop({ id: 'b', date: '2026-10-18' }),
      stop({ id: 'c', date: '2026-10-20' }),
    ]);

    expect(built.stats.days).toBe(2);
  });

  /* 餐廳美食 is its own count, so a meal is not also a 景點. */
  it('separates places from meals', () => {
    const built = recap([
      stop({ id: 'a', title: '淺草寺' }),
      stop({ id: 'b', title: '一蘭拉麵', type: 'FOOD' }),
      stop({ id: 'c', title: '黑船亭 洋食料理', type: 'FOOD' }),
    ]);

    expect(built.stats.places).toBe(1);
    expect(built.stats.meals).toBe(2);
  });

  /*
    A stop still to come is not a visit. The counts answer 「where did I get
    to」, and a plan is not an answer to that.
  */
  it('leaves tomorrow out of the visited counts', () => {
    const built = recap([
      stop({ id: 'a', date: '2026-10-18' }),
      stop({ id: 'b', date: '2026-10-25' }),
    ]);

    expect(built.stats.places).toBe(1);
    expect(built.stats.days).toBe(2);
  });

  /* 「若按完成」 — a ticked stop counts today, same rule as the 已訪 chip. */
  it('counts a stop the traveller ticked, whatever the date says', () => {
    const built = recap([stop({ date: '2026-10-25', isCompleted: true })]);

    expect(built.stats.places).toBe(1);
  });

  it('totals every bill on a ledger with nobody to apportion to', () => {
    const built = recap([stop()], [bill(), bill({ id: 'e2', twdAmount: 1200 })]);

    expect(built.stats.totalTwd).toBe(2146);
  });

  /*
    「釜山總花費是錯的 只需要算我自己」. It summed `twdAmount` — every bill
    whole, including the half a companion carries — so a shared trip reported
    a number the traveller had never spent. One rule for 「what did this cost
    me」, shared with the ledger, the day card and the closing report.
  */
  it('counts only the reader\'s share of a shared bill', () => {
    const shared = bill({
      twdAmount: 1000,
      beneficiaries: ['me', 'sherry'],
      splitMethod: 'EXACT',
      splitAllocations: { me: 400, sherry: 600 },
    });
    const built = buildTripRecap({
      trip: { itinerary: [stop()] },
      expenses: [shared],
      today: TODAY,
      viewerMemberId: 'me',
      members: [
        { id: 'me', name: '我', type: 'owner' },
        { id: 'sherry', name: 'Sherry', type: 'companion' },
      ] as never,
    });

    expect(built.stats.totalTwd).toBe(400);
  });
});

/*
  「這都能去掉機場」 — 桃園 and 成田 were pins on the footprint, areas of their
  own, and counted as 造訪景點. An airport is the one place on a trip nobody
  chose to go to.
*/
describe('getting there is not being there', () => {
  const airport = stop({
    id: 'tpe', title: 'Taiwan Taoyuan International Airport',
    type: 'FLIGHT', latitude: 25.0777, longitude: 121.2328,
  });

  it('leaves an airport out of 造訪景點', () => {
    const built = recap([stop({ id: 'a' }), airport]);

    expect(built.stats.places).toBe(1);
  });

  /* By name as well as by type: an item typed ACTIVITY still reads as one. */
  it('reads an airport by its name when the type says nothing', () => {
    const built = recap([stop({ id: 'nrt', title: '成田機場第二航廈' })]);

    expect(built.stats.places).toBe(0);
  });

  it('never promotes an airport to 旅程亮點, however it was rated', () => {
    const built = recap(
      [{ ...airport, latitude: 25.0777, longitude: 121.2328 }],
      [bill({
        merchant: 'Taiwan Taoyuan International Airport', rating: 5,
        merchantLatitude: 25.0777, merchantLongitude: 121.2328,
      })],
    );

    expect(built.highlights).toEqual([]);
    expect(built.favouritePlace).toBeUndefined();
  });

  /* It still happened, so the day still lists it. */
  it('keeps it on the day it was on', () => {
    const built = recap([airport]);

    expect(built.days[0].stops.map(entry => entry.itemId)).toEqual(['tpe']);
  });

  it('calls a flight and a hotel what they are', () => {
    const built = recap([
      stop({ id: 'f', title: 'JL802', type: 'FLIGHT' }),
      stop({ id: 'h', title: 'Hotel Plus Hostel', type: 'HOTEL' }),
    ]);

    expect(built.days[0].stops.map(entry => entry.category)).toEqual(['transport', 'stay']);
  });
});

describe('the days', () => {
  it('numbers them from one, in date order', () => {
    const built = recap([
      stop({ id: 'c', date: '2026-10-20' }),
      stop({ id: 'a', date: '2026-10-18' }),
    ]);

    expect(built.days.map(day => [day.index, day.date]))
      .toEqual([[1, '2026-10-18'], [2, '2026-10-20']]);
  });

  it('puts a day in clock order', () => {
    const built = recap([
      stop({ id: 'late', time: '18:30', title: '黑船亭' }),
      stop({ id: 'early', time: '09:00', title: '淺草寺' }),
    ]);

    expect(built.days[0].stops.map(entry => entry.title)).toEqual(['淺草寺', '黑船亭']);
  });

  /* A stop with no date is not on any day and must not invent one. */
  it('drops a stop with no date', () => {
    const built = recap([stop({ date: undefined })]);

    expect(built.days).toEqual([]);
    expect(built.stats.days).toBe(0);
  });
});

describe('what a stop carries', () => {
  const kurofune = stop({
    id: 'k', title: 'Kurofunetei 黑船亭', type: 'FOOD',
    latitude: 35.7108, longitude: 139.7753,
  });

  const atKurofune = bill({
    merchant: 'KUROFUNE-TEI',
    merchantLatitude: 35.7108, merchantLongitude: 139.7753,
    rating: 5, note: '蘑菇義大利麵超好吃！', receiptPhotos: ['till-roll'],
  });

  it('takes the rating, note, photo and spend off the bill recorded there', () => {
    const [entry] = recap([kurofune], [atKurofune]).days[0].stops;

    expect(entry.rating).toBe(5);
    expect(entry.note).toBe('蘑菇義大利麵超好吃！');
    expect(entry.photo).toBe('till-roll');
    expect(entry.twdAmount).toBe(946);
  });

  /*
    The app holds no album. A stop nobody photographed has no picture, and
    filling it with Google's photo of the same door would caption somebody
    else's photograph as their trip.
  */
  it('leaves a stop with no bill with no picture and no stars', () => {
    const [entry] = recap([stop()]).days[0].stops;

    expect(entry.photo).toBeUndefined();
    expect(entry.rating).toBeUndefined();
    expect(entry.twdAmount).toBeUndefined();
  });

  /* A bill somewhere else is somewhere else. */
  it('does not attach a bill from another shop', () => {
    const [entry] = recap([kurofune], [bill({ description: '便利商店', merchant: 'LAWSON' })]).days[0].stops;

    expect(entry.rating).toBeUndefined();
    expect(entry.twdAmount).toBeUndefined();
  });

  /* A stop's spend is the same question: what it cost the person reading. */
  it('shows the reader\'s share of what was spent at a place', () => {
    const built = buildTripRecap({
      trip: { itinerary: [kurofune] },
      expenses: [{
        ...atKurofune,
        twdAmount: 1000,
        beneficiaries: ['me', 'sherry'],
        splitMethod: 'EXACT',
        splitAllocations: { me: 400, sherry: 600 },
      }],
      today: TODAY,
      viewerMemberId: 'me',
      members: [
        { id: 'me', name: '我', type: 'owner' },
        { id: 'sherry', name: 'Sherry', type: 'companion' },
      ] as never,
    });

    expect(built.days[0].stops[0].twdAmount).toBe(400);
  });

  it('adds up two bills at the same place', () => {
    const built = recap([kurofune], [
      atKurofune,
      { ...atKurofune, id: 'e2', twdAmount: 500, rating: 3 },
    ]);

    expect(built.days[0].stops[0].twdAmount).toBe(1446);
    // The best opinion given, not the latest: two visits, one of them better.
    expect(built.days[0].stops[0].rating).toBe(5);
  });
});

describe('旅程亮點', () => {
  /*
    The bill's own category is now what settles what kind of place this was,
    so a sight is paid for under 票券 and a restaurant under 餐飲 — which is
    how a traveller files them anyway.
  */
  const rated = (id: string, title: string, rating: number, over: Partial<ItineraryItem> = {}) => ({
    item: stop({ id, title, latitude: 35 + rating / 1000, longitude: 139, ...over }),
    bill: bill({
      id: `b${id}`, merchant: title, rating,
      category: over.type === 'FOOD' ? Category.FOOD : Category.TICKET,
      merchantLatitude: 35 + rating / 1000, merchantLongitude: 139,
    }),
  });

  const four = [
    rated('a', 'Sensoji Temple', 5),
    rated('b', 'Kurofunetei', 4, { type: 'FOOD' }),
    rated('c', 'Shinjuku Gyoen', 3),
    rated('d', 'Tokyo Skytree', 2),
  ];

  const built = recap(four.map(entry => entry.item), four.map(entry => entry.bill));

  it('is the three best, best first', () => {
    expect(built.highlights.map(entry => entry.title))
      .toEqual(['Sensoji Temple', 'Kurofunetei', 'Shinjuku Gyoen']);
  });

  it('names a favourite place and a favourite meal separately', () => {
    expect(built.favouritePlace?.title).toBe('Sensoji Temple');
    expect(built.favouriteMeal?.title).toBe('Kurofunetei');
  });

  /*
    Nothing rated is an empty highlights list, not three arbitrary stops. A
    review that promotes a stop nobody praised is making the praise up.
  */
  it('is empty when nothing was rated', () => {
    const bare = recap([stop({ id: 'a' }), stop({ id: 'b', title: '東京鐵塔' })]);

    expect(bare.highlights).toEqual([]);
    expect(bare.favouritePlace).toBeUndefined();
    expect(bare.favouriteMeal).toBeUndefined();
  });

  /* A stop still to come cannot be a highlight of a trip. */
  it('ignores a rating on a stop that has not happened', () => {
    const ahead = rated('future', 'Future Diner', 5, { date: '2026-11-01' });
    const built = recap([ahead.item], [ahead.bill]);

    expect(built.highlights).toEqual([]);
  });
});

/*
  「如果我有筆記都用我的資料」 — 最愛景點 was offering Badamaru Jeonbok-juk, a
  전복죽 restaurant, because no name rule recognises it. The traveller had
  already said what it was: the bill is filed under 餐飲.
*/
describe('the ledger says what kind of place it was', () => {
  const place = stop({ id: 'b', title: 'Badamaru Jeonbok-juk', latitude: 35.1, longitude: 129.1 });
  const paid = (category: Category) => bill({
    merchant: 'Badamaru Jeonbok-juk', category, rating: 5,
    merchantLatitude: 35.1, merchantLongitude: 129.1,
  });

  it('calls a stop filed under 餐飲 a meal, whatever its name looks like', () => {
    const built = recap([place], [paid(Category.FOOD)]);

    expect(built.days[0].stops[0].category).toBe('food');
    expect(built.favouriteMeal?.title).toBe('Badamaru Jeonbok-juk');
    expect(built.favouritePlace).toBeUndefined();
  });

  it('calls a stop filed under 購物 shopping', () => {
    expect(recap([place], [paid(Category.SHOPPING)]).days[0].stops[0].category).toBe('shop');
  });

  /* A stated type on the item still wins: it is the more specific statement. */
  it('lets the item\'s own type overrule the ledger', () => {
    const built = recap([{ ...place, type: 'FLIGHT' }], [paid(Category.FOOD)]);

    expect(built.days[0].stops[0].category).toBe('transport');
  });

  /* Nothing filed and nothing in the name is still 「not known」. */
  it('falls back to the name when no bill says anything', () => {
    expect(recap([place]).days[0].stops[0].category).toBe('other');
  });
});

describe('starsFor', () => {
  it('prints as many stars as were given', () => {
    expect(starsFor(4)).toBe('★★★★');
  });

  it('prints nothing for a rating nobody gave', () => {
    expect(starsFor(undefined)).toBe('');
    expect(starsFor(0)).toBe('');
  });
});
