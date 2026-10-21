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

  it('totals every bill on the trip', () => {
    const built = recap([stop()], [bill(), bill({ id: 'e2', twdAmount: 1200 })]);

    expect(built.stats.totalTwd).toBe(2146);
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
  const rated = (id: string, title: string, rating: number, over: Partial<ItineraryItem> = {}) => ({
    item: stop({ id, title, latitude: 35 + rating / 1000, longitude: 139, ...over }),
    bill: bill({
      id: `b${id}`, merchant: title, rating,
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

describe('starsFor', () => {
  it('prints as many stars as were given', () => {
    expect(starsFor(4)).toBe('★★★★');
  });

  it('prints nothing for a rating nobody gave', () => {
    expect(starsFor(undefined)).toBe('');
    expect(starsFor(0)).toBe('');
  });
});
