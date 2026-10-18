/**
 * The preparation list must cover what the schedule actually requires.
 *
 * The model writes the itinerary and the preparation list as two separate
 * fields, and nothing made them agree. A plan opened with 「東京都心租車出發」
 * and listed a driving licence translation and a restaurant booking — but
 * never said to book the car. Everything the traveller reads looks complete,
 * and the one arrangement the whole day depends on is missing.
 *
 * Same rule as `durationDays`: what the screen shows is derived from the items
 * that actually get written into the itinerary, not from a second answer the
 * model gave separately.
 *
 * Deliberately narrow. This only covers arrangements the schedule *names* and
 * that cannot reliably be sorted out on the spot — booking a car you turn up
 * without is a day lost, whereas buying a train ticket is not. Anything the
 * model wants to add beyond these is still its own to add: this fills gaps,
 * it does not replace the model's list.
 */

export interface PreparationTask {
  name: string;
  canBeHumanAssisted: boolean;
  /**
   * Only doable before leaving home — a permit issued by your own country's
   * authority, a visa collected in person. Set here rather than asked of the
   * model, and read by the screen, which is the only place that knows what
   * day it is where the traveller is standing.
   */
  beforeDeparture?: boolean;
  /**
   * How many days ahead this has to be arranged.
   *
   * 「若很熱門就要放進去行前規劃中。比方說有些觀光列車是提前一個月要預約的」 — and
   * that is a different kind of task from the rest of this list. 「before you
   * leave」 is still weeks away; 「a month before you leave」 may already be
   * today, and a checkbox cannot say that.
   *
   * Only set where the lead time is a published rule rather than a guess. An
   * invented number here is worse than none: it would tell somebody they have
   * missed a deadline that does not exist.
   */
  leadTimeDays?: number;
}

/**
 * A place on the schedule that is known to need booking ahead.
 *
 * 「若很熱門就要放進去行前規劃中」, and then 「兩條都接」. The keyword rules below
 * read the *words* on a schedule, so they only ever catch the categories
 * somebody thought to list — 觀光列車, 租車, 渡輪. This reads the *place*: when
 * the commerce catalogue says a venue cannot be walked into, that is a fact
 * about the venue whatever it happens to be called.
 *
 * Supplied by the caller rather than looked up here, because 「which places
 * need booking」 is the commerce layer's question and this file is about what a
 * schedule implies.
 */
export interface AdvanceBookingPlace {
  name: string;
  /** Where the lead time is a published rule. See `leadTimeDays`. */
  leadTimeDays?: number;
}

export interface ScheduleItem {
  title?: string;
  placeName?: string;
  notes?: string;
}

interface Requirement {
  /** Words in the schedule that mean this arrangement is part of the plan. */
  mentions: string[];
  /** Words that mean the preparation list already covers it. */
  satisfiedBy: string[];
  task: PreparationTask;
}

const REQUIREMENTS: Requirement[] = [
  {
    // Hiring a vehicle: turning up without a reservation can end the day, and
    // in Japan and Korea the counters routinely sell out in season.
    mentions: ['租車', '自駕', 'レンタカー', 'rental car', 'rent a car'],
    satisfiedBy: ['租車', '車輛', 'レンタカー', 'rental car'],
    task: { name: '預約租車', canBeHumanAssisted: true },
  },
  {
    mentions: ['包車'],
    satisfiedBy: ['包車'],
    task: { name: '預約包車與司機', canBeHumanAssisted: true },
  },
  {
    /*
      Japan's joyful trains and other reserved sightseeing services.

      Reservations open exactly one month before the departure date at
      みどりの窓口 and on the JR sites, and the popular ones are gone that
      morning. Unlike everything else in this list, being late here is not an
      inconvenience that can be sorted out locally — the seat does not exist
      any more.
    */
    mentions: ['觀光列車', '觀光火車', '景觀列車', '觀光小火車', '觀光列車之旅', 'sightseeing train', 'scenic train', '觀光列車行程'],
    satisfiedBy: ['觀光列車', '列車訂位', '景觀列車', 'sightseeing train'],
    task: { name: '預約觀光列車座位', canBeHumanAssisted: true, leadTimeDays: 30 },
  },
  {
    // Sailings run to a timetable and sell out; missing one is not a delay,
    // it is the next day.
    mentions: ['渡輪', '渡船', '船班', 'ferry'],
    satisfiedBy: ['船票', '渡輪', '船班', 'ferry'],
    task: { name: '確認船班時刻與訂票', canBeHumanAssisted: true },
  },
];

const haystack = (items: ScheduleItem[]): string =>
  items
    .flatMap(item => [item.title, item.placeName, item.notes])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

const covered = (preparation: PreparationTask[], words: string[]): boolean => {
  const text = preparation.map(task => task.name).join(' ').toLowerCase();
  return words.some(word => text.includes(word.toLowerCase()));
};

/**
 * Preparation the schedule requires but the list does not mention.
 *
 * Returns only the additions, so a caller can decide where they belong.
 */
export const missingPreparation = (
  items: ScheduleItem[],
  preparation: PreparationTask[],
): PreparationTask[] => {
  if (items.length === 0) return [];
  const schedule = haystack(items);
  return REQUIREMENTS
    .filter(requirement => requirement.mentions.some(word => schedule.includes(word.toLowerCase())))
    .filter(requirement => !covered(preparation, requirement.satisfiedBy))
    .map(requirement => requirement.task);
};

/**
 * The preparation list with anything the schedule requires added in front.
 *
 * Derived tasks lead: they come from what the plan will actually do, while the
 * model's are its own reading of the same plan. The cap exists because a list
 * nobody finishes reading is a list nobody acts on.
 */
export const withRequiredPreparation = (
  items: ScheduleItem[],
  preparation: PreparationTask[],
  limit = 5,
  /** Places the commerce layer knows cannot be walked into. */
  advanceBooking: AdvanceBookingPlace[] = [],
): PreparationTask[] => {
  const booked = advanceBooking
    // Only the ones this schedule actually visits.
    .filter(place => place.name.trim() && haystack(items).includes(place.name.trim().toLowerCase()))
    .filter(place => !covered(preparation, [place.name]))
    .map(place => ({
      name: `預訂 ${place.name.trim()}`,
      canBeHumanAssisted: true,
      ...(typeof place.leadTimeDays === 'number' ? { leadTimeDays: place.leadTimeDays } : {}),
    }));

  const additions = [...booked, ...missingPreparation(items, preparation)];
  // Deduplicated by name: a 觀光列車 keyword and a curated 觀光列車 venue are one
  // task, and a list that says it twice is a list somebody stops reading.
  const seen = new Set<string>();
  const distinct = additions.filter(task => !seen.has(task.name) && seen.add(task.name));

  if (distinct.length === 0) return preparation.slice(0, limit);
  return [...distinct, ...preparation].slice(0, limit);
};

/**
 * Preparation that can only happen in the traveller's own country, before
 * they leave.
 *
 * A plan offering a self-drive day needs an international permit, and that is
 * issued at home by appointment — someone already in Osaka cannot get one, so
 * the plan is not merely inconvenient for them, it is impossible. On screen it
 * looked like any other unticked box.
 *
 * Narrow on purpose, and only documents: things issued by an authority in the
 * traveller's own country, where there is no equivalent to be arranged on
 * arrival. Booking a restaurant from abroad is fine; a driving permit is not.
 */
const BEFORE_DEPARTURE_WORDS = [
  '國際駕照',
  '駕照譯本',
  '駕照日文譯本',
  '簽證',
  'visa',
  '國際駕駛',
  '旅平險',
  '旅遊保險',
];

export const isBeforeDepartureOnly = (taskName: string): boolean => {
  const name = taskName.toLowerCase();
  return BEFORE_DEPARTURE_WORDS.some(word => name.includes(word.toLowerCase()));
};

/** The same list, with anything only doable at home marked as such. */
export const markDepartureTiming = (preparation: PreparationTask[]): PreparationTask[] =>
  preparation.map(task => (
    isBeforeDepartureOnly(task.name) ? { ...task, beforeDeparture: true } : task
  ));

/**
 * Whether the trip is already under way, judged on the device's own date.
 *
 * Deliberately compared where the traveller is: the server's clock is in a
 * data centre, and the question is what day it is for the person holding the
 * phone. Both values are plain dates, so this is a day-level comparison and
 * needs no timezone maths.
 *
 * Known limit, recorded rather than guessed at: this catches "too late", not
 * "cutting it fine". A permit is equally out of reach the day before departure,
 * but choosing how many days of notice each document needs would mean inventing
 * numbers, which is worse than saying nothing.
 */
export const tripHasStarted = (today: string, tripStartDate?: string): boolean => {
  if (!tripStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(tripStartDate)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return today >= tripStartDate;
};
