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
import { Expense, ItineraryItem, Trip } from '../types';
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
  /** What was spent here, in TWD, across every bill matched to it. */
  twdAmount?: number;
  /** What they wrote on the bill afterwards, when they wrote anything. */
  note?: string;
}

export interface RecapDay {
  date: string;
  /** 1-based, as the day chips print it. */
  index: number;
  stops: RecapStop[];
}

export interface RecapStats {
  days: number;
  /** Visited stops that were not a meal. */
  places: number;
  /** Visited stops that were. */
  meals: number;
  /** Every bill on the trip, in TWD. */
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
};

/**
 * What kind of stop this was.
 *
 * The item's own `type` first — it is a stated field — and the name only when
 * that said nothing useful. `ACTIVITY` is the default every item carries, so
 * it is not evidence of anything and is left to the name rules.
 */
const categoryOf = (item: ItineraryItem): PlaceCategory =>
  BY_SLICE[item.type] ?? placeCategory({ name: item.title });

/** A day that has been and gone, or a stop the traveller ticked. */
const hasHappened = (item: ItineraryItem, today: string): boolean =>
  item.isCompleted === true || Boolean(item.date && item.date < today);

/** The best rating among the bills at a place, and the first photo there is. */
const fromBills = (bills: SpendAtPlace[]) => {
  const rated = bills.map(bill => bill.rating).filter((value): value is number => typeof value === 'number');
  const photo = bills.flatMap(bill => bill.photos ?? (bill.photo ? [bill.photo] : []))[0];
  const note = bills.map(bill => bill.note?.trim()).find(Boolean);
  const spent = bills.reduce((sum, bill) => sum + (bill.twdAmount || 0), 0);
  return {
    ...(rated.length > 0 ? { rating: Math.max(...rated) } : {}),
    ...(photo ? { photo } : {}),
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
  },
): TripRecap => {
  const items = (input.trip.itinerary || []).filter(item => Boolean(item.date));

  const stops: RecapStop[] = items.map(item => ({
    itemId: item.id,
    date: item.date as string,
    time: item.time,
    title: item.title,
    ...(item.location?.trim() ? { location: item.location.trim() } : {}),
    category: categoryOf(item),
    ...(typeof item.latitude === 'number' && typeof item.longitude === 'number'
      && !(item.latitude === 0 && item.longitude === 0)
      ? { latitude: item.latitude, longitude: item.longitude }
      : {}),
    ...fromBills(spendAtPlace(asPlace(item), input.expenses)),
  }));

  const happened = new Set(items.filter(item => hasHappened(item, input.today)).map(item => item.id));
  const visited = stops.filter(stop => happened.has(stop.itemId));

  const dates = [...new Set(stops.map(stop => stop.date))].sort();
  const days: RecapDay[] = dates.map((date, index) => ({
    date,
    index: index + 1,
    stops: stops
      .filter(stop => stop.date === date)
      .sort((left, right) => left.time.localeCompare(right.time)),
  }));

  /*
    Best first, and ties broken by what was spent rather than left to the
    order the itinerary happens to be in — a review that reshuffles its own
    Top 3 between two openings reads as though it were made up.
  */
  const byRating = visited
    .filter(stop => typeof stop.rating === 'number')
    .sort((left, right) =>
      (right.rating as number) - (left.rating as number)
      || (right.twdAmount ?? 0) - (left.twdAmount ?? 0)
      || left.title.localeCompare(right.title));

  return {
    stats: {
      days: dates.length,
      places: visited.filter(stop => stop.category !== 'food').length,
      meals: visited.filter(stop => stop.category === 'food').length,
      totalTwd: input.expenses.reduce((sum, expense) => sum + (expense.twdAmount || 0), 0),
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
