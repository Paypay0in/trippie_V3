/**
 * 旅程回顧 — what a finished trip actually is, read back out of the records.
 *
 * Every number on that screen is derived here and nowhere else. A review is
 * the one screen a traveller reads a year later with no way to check it, so
 * the standard is higher than usual: nothing on it may be a guess dressed as
 * a memory.
 *
 * What that rules out:
 *
 * - A stop's photograph is the one the traveller took of their own bill. The
 *   app holds no album. A strip of Google's pictures of the same temple would
 *   be captioning somebody else's photographs as their trip.
 * - A stop's rating is the one given at the till. Ratings live on expenses
 *   （see `statedRatings`） because that is where somebody was standing when
 *   they had an opinion. A stop with no bill has no stars, and no stars means
 *   「not rated」, never 「rated badly」.
 * - 造訪 means a day that has been and gone, or a stop the traveller ticked.
 *   The same rule the collection's 已訪 chip uses, from `visitedPlaces`.
 *
 * The bill belonging to a stop is found by `spendAtPlace`, unchanged, with the
 * stop read as a place. That function is the project's one answer to 「is this
 * record about that shop」, and the day this file grew a second, looser answer
 * of its own is the day the review starts attributing the wrong dinner to the
 * wrong evening.
 */
import { Category, Expense, ItineraryItem, Trip, TripMember } from '../types';
import { expenseCostToViewer, ownerMemberIdOf } from './viewerSpend';
import { PlaceCategory, placeCategory } from './placeCategory';
import { SpendAtPlace, spendAtPlace } from './spendAtPlace';

/** One stop that happened, with whatever the records hold about it. */
export interface RecapStop {
  itemId: string;
  date: string;
  time: string;
  title: string;
  location?: string;
  category: PlaceCategory;
  /** Carried so the footprint map can pin it; absent on an unresolved stop. */
  latitude?: number;
  longitude?: number;
  /** From a bill at this place, when one was rated. */
  rating?: number;
  /** The traveller's own photo of their bill, when there is one. */
  photo?: string;
  /** Every photo recorded at this stop, for the grid on the day. */
  photos?: string[];
  /** What was spent here, in TWD, across every bill matched to it. */
  twdAmount?: number;
  /** What they wrote on the bill afterwards, when they wrote anything. */
  note?: string;
  /**
   * The diary written against the stop itself.
   *
   * 「淺草寺啊啥的 應該要讓我點擊可以寫下日記」 — a temple costs nothing, so it
   * has no bill and had nowhere to hold what happened there. This is the
   * item's own `notes`, which has always existed and always synced.
   */
  diary?: string;
}

/** What one day was made of, for the row of figures above its timeline. */
export interface RecapDayStats {
  sights: number;
  food: number;
  shopping: number;
  /** What the day cost the person reading, in TWD. */
  twdAmount: number;
}

export interface RecapDay {
  date: string;
  /** 1-based, as the day chips print it. */
  index: number;
  stops: RecapStop[];
  stats: RecapDayStats;
}

export interface RecapStats {
  days: number;
  /** Visited stops that were not a meal. */
  places: number;
  /** Visited stops that were. */
  meals: number;
  /**
   * What the trip cost *this* traveller, in TWD.
   *
   * 「釜山總花費是錯的 只需要算我自己」 — it was summing `twdAmount`, every bill
   * whole, including the half a companion carries and the bills they paid for
   * themselves. `expenseCostToViewer` is the one place that answers 「what did
   * this cost me」 and four other screens already used it; the review had
   * quietly written a fifth answer.
   */
  totalTwd: number;
}

export interface TripRecap {
  stats: RecapStats;
  /** Every day of the trip that holds a stop, in order. */
  days: RecapDay[];
  /** Only the stops that have been and gone. */
  visited: RecapStop[];
  /** The highest-rated visited stops, best first. Empty until something is rated. */
  highlights: RecapStop[];
  /** The best-rated stop that was not a meal, and the best that was. */
  favouritePlace?: RecapStop;
  favouriteMeal?: RecapStop;
}

/** A stop, read as a place, so `spendAtPlace` can answer for it. */
const asPlace = (item: ItineraryItem) => ({
  placeId: item.placeId,
  latitude: item.latitude,
  longitude: item.longitude,
  placeName: item.title,
  resolvedPlaceName: undefined,
  formattedAddress: item.address,
});

const BY_SLICE: Partial<Record<ItineraryItem['type'], PlaceCategory>> = {
  FOOD: 'food',
  /*
    A flight is a way of getting there, not somewhere you went.

    「這都能去掉機場」 — 桃園 and 成田 were pins on the footprint map and areas
    in their own right, and 造訪景點 counted them. An airport is the one place
    on the map nobody chose.
  */
  FLIGHT: 'transport',
  TRANSPORT: 'transport',
  HOTEL: 'stay',
};

/**
 * What the traveller filed the bill at this stop under.
 *
 * 「如果我有筆記都用我的資料」 — 最愛景點 was offering Badamaru Jeonbok-juk, a
 * 전복죽 restaurant, because no name rule in any language recognises it and
 * the fallback is 「not food」. The traveller had already answered: the bill is
 * filed under 餐飲. A stated category beats a guess at a name, every time.
 */
const BY_LEDGER: Partial<Record<Category, PlaceCategory>> = {
  [Category.FOOD]: 'food',
  [Category.SHOPPING]: 'shop',
  [Category.SOUVENIR]: 'shop',
  [Category.COSMETICS]: 'shop',
  [Category.ELECTRONICS]: 'shop',
  [Category.FASHION]: 'shop',
  [Category.ACCESSORIES]: 'shop',
  [Category.TRANSPORT]: 'transport',
  [Category.TRANSPORT_AIRPORT]: 'transport',
  [Category.TRANSPORT_POST]: 'transport',
  [Category.ACCOMMODATION]: 'stay',
};

/**
 * What kind of stop this was.
 *
 * The item's own `type` first — it is a stated field — and the name only when
 * that said nothing useful. `ACTIVITY` is the default every item carries, so
 * it is not evidence of anything and is left to the name rules.
 */
const categoryOf = (item: ItineraryItem, filedAs?: PlaceCategory): PlaceCategory =>
  BY_SLICE[item.type] ?? filedAs ?? placeCategory({ name: item.title });

/**
 * Getting there, rather than being there.
 *
 * Exported because the areas on the review are grouped from the itinerary
 * directly, and an airport that is off the map but still its own 一帶 would
 * be the screen disagreeing with itself.
 *
 * Read off `placeCategory`, which has answered 「what kind of place is this」
 * for this project since the collection's tags — 機場, airport, 航站, station
 * are all already in its table. A second airport rule here would be a second
 * answer to a question already settled.
 */
export const isGettingThere = (item: ItineraryItem): boolean =>
  categoryOf(item) === 'transport';

/** A day that has been and gone, or a stop the traveller ticked. */
const hasHappened = (item: ItineraryItem, today: string): boolean =>
  item.isCompleted === true || Boolean(item.date && item.date < today);

/** The best rating among the bills at a place, and the first photo there is. */
const fromBills = (bills: SpendAtPlace[], costOf: (expenseId: string) => number) => {
  const rated = bills.map(bill => bill.rating).filter((value): value is number => typeof value === 'number');
  const shots = bills.flatMap(bill => bill.photos ?? (bill.photo ? [bill.photo] : []));
  const photo = shots[0];
  const note = bills.map(bill => bill.note?.trim()).find(Boolean);
  const spent = bills.reduce((sum, bill) => sum + costOf(bill.expenseId), 0);
  return {
    ...(rated.length > 0 ? { rating: Math.max(...rated) } : {}),
    ...(photo ? { photo, photos: shots } : {}),
    ...(note ? { note } : {}),
    ...(spent > 0 ? { twdAmount: spent } : {}),
  };
};

export const buildTripRecap = (
  input: {
    trip: Pick<Trip, 'itinerary'>;
    /** Already carrying any device-held ratings; see `withStatedRatings`. */
    expenses: Expense[];
    today: string;
    /**
     * Who is reading, and the roster their share is worked out against.
     *
     * Absent on a solo ledger, where the whole amount is the honest answer:
     * there is nobody to apportion to.
     */
    viewerMemberId?: string;
    members?: TripMember[];
  },
): TripRecap => {
  const items = (input.trip.itinerary || []).filter(item => Boolean(item.date));
  const ownerMemberId = ownerMemberIdOf(input.members);
  /* One rule for 「what did this cost me」, shared with the ledger and the day card. */
  const costToViewer = (expense: Expense) =>
    expenseCostToViewer(expense, input.viewerMemberId, ownerMemberId);
  const costById = new Map(input.expenses.map(expense => [expense.id, costToViewer(expense)]));
  const costOf = (expenseId: string) => costById.get(expenseId) ?? 0;
  /* How the traveller filed the bills at a place, when any of them says. */
  const ledgerCategory = new Map(
    input.expenses.map(expense => [expense.id, BY_LEDGER[expense.category]]),
  );
  const filedCategory = (bills: SpendAtPlace[]): PlaceCategory | undefined =>
    bills.map(entry => ledgerCategory.get(entry.expenseId)).find(Boolean);

  const stops: RecapStop[] = items.map(item => {
  const bills = spendAtPlace(asPlace(item), input.expenses);
  const fromLedger = fromBills(bills, costOf);
  const ownPhotos = item.photos ?? [];
  return {
    itemId: item.id,
    date: item.date as string,
    time: item.time,
    title: item.title,
    ...(item.location?.trim() ? { location: item.location.trim() } : {}),
    ...(item.notes?.trim() ? { diary: item.notes.trim() } : {}),
    category: categoryOf(item, filedCategory(bills)),
    ...(typeof item.latitude === 'number' && typeof item.longitude === 'number'
      && !(item.latitude === 0 && item.longitude === 0)
      ? { latitude: item.latitude, longitude: item.longitude }
      : {}),
    ...fromLedger,
    /*
      The stop's own star wins over the till's.

      Both are the traveller's, and this is the later and more deliberate of
      the two: the till's was given while paying, this one while looking back
      at the day. Its own photographs lead, with the bills' behind them.
    */
    ...(typeof item.rating === 'number' ? { rating: item.rating } : {}),
    ...(ownPhotos.length > 0
      ? { photo: ownPhotos[0], photos: [...ownPhotos, ...(fromLedger.photos ?? [])] }
      : {}),
  };
  });

  const happened = new Set(items.filter(item => hasHappened(item, input.today)).map(item => item.id));
  const visited = stops.filter(stop => happened.has(stop.itemId));

  const dates = [...new Set(stops.map(stop => stop.date))].sort();
  const days: RecapDay[] = dates.map((date, index) => {
    const onThisDay = stops
      .filter(stop => stop.date === date)
      .sort((left, right) => left.time.localeCompare(right.time));
    const count = (category: PlaceCategory) =>
      onThisDay.filter(stop => stop.category === category).length;
    return {
      date,
      index: index + 1,
      stops: onThisDay,
      stats: {
        // 景點 is the sights, not 「everything that was not a meal」: a hotel
        // and a station are neither, and counting them would inflate a figure
        // somebody reads as 「how much did I see」.
        sights: count('sight'),
        food: count('food') + count('cafe'),
        shopping: count('shop'),
        twdAmount: onThisDay.reduce((sum, stop) => sum + (stop.twdAmount ?? 0), 0),
      },
    };
  });

  /*
    Best first, and ties broken by what was spent rather than left to the
    order the itinerary happens to be in — a review that reshuffles its own
    Top 3 between two openings reads as though it were made up.
  */
  const byRating = visited
    .filter(stop => typeof stop.rating === 'number' && stop.category !== 'transport')
    .sort((left, right) =>
      (right.rating as number) - (left.rating as number)
      || (right.twdAmount ?? 0) - (left.twdAmount ?? 0)
      || left.title.localeCompare(right.title));

  return {
    stats: {
      days: dates.length,
      places: visited.filter(stop => stop.category !== 'food' && stop.category !== 'transport').length,
      meals: visited.filter(stop => stop.category === 'food').length,
      totalTwd: input.expenses.reduce((sum, expense) => sum + costToViewer(expense), 0),
    },
    days,
    visited,
    highlights: byRating.slice(0, 3),
    favouritePlace: byRating.find(stop => stop.category !== 'food'),
    favouriteMeal: byRating.find(stop => stop.category === 'food'),
  };
};

/** 「★★★★」 — as many as were given, never a rounded half. */
export const starsFor = (rating?: number): string =>
  typeof rating === 'number' && rating > 0 ? '★'.repeat(Math.min(5, Math.round(rating))) : '';
