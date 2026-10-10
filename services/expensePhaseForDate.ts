import { Category, Phase } from '../types';
import { CATEGORIES_BY_PHASE } from '../constants';

/**
 * Which stage of the trip a bill belongs to.
 *
 * 「上傳的收據要按照時間點歸帳 10/3根本還沒回國」. A batch import filed everything by
 * category, and the category lists overlap on purpose — 美妝保養, 服飾鞋包, 伴手禮
 * and 其他 all appear under 回國機場消費, because those are things people buy at
 * the airport on the way home. They are also things people buy on day two.
 * Worse, the test ran 「pre, then post」 in sequence, so 其他 — which is in all
 * three lists — came out 'post' every single time.
 *
 * A date answers this and a category cannot. A purchase on 10/03 of a trip
 * running 10/02–10/07 happened mid-trip, whatever was bought.
 */

export interface TripWindow {
  startDate?: string;
  endDate?: string;
}

/** Category as the last resort: it is a guess about a shopping habit. */
export const phaseFromCategory = (category: Category): Phase => {
  if (CATEGORIES_BY_PHASE.during.includes(category)) return 'during';
  if (CATEGORIES_BY_PHASE.pre.includes(category)) return 'pre';
  if (CATEGORIES_BY_PHASE.post.includes(category)) return 'post';
  return 'during';
};

const isIsoDate = (value?: string): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * The stage a bill falls in, by when it happened.
 *
 * Falls back to the category only where the dates cannot answer: a trip with
 * no dates set yet, or a receipt whose own date could not be read.
 */
export const phaseForExpenseDate = (
  date: string | undefined,
  trip: TripWindow,
  category: Category,
): Phase => {
  if (!isIsoDate(date)) return phaseFromCategory(category);

  const { startDate, endDate } = trip;
  // Comparing ISO dates as strings is exact and timezone-free, which is the
  // whole reason they are stored this way.
  if (isIsoDate(startDate) && date < startDate) return 'pre';
  if (isIsoDate(endDate) && date > endDate) return 'post';
  if (isIsoDate(startDate) || isIsoDate(endDate)) return 'during';

  // Neither end known: the date says nothing about a window that does not
  // exist, so the category is all there is.
  return phaseFromCategory(category);
};
