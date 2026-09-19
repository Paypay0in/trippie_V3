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
): PreparationTask[] => {
  const additions = missingPreparation(items, preparation);
  if (additions.length === 0) return preparation.slice(0, limit);
  return [...additions, ...preparation].slice(0, limit);
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
