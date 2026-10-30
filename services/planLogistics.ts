/**
 * How much travelling a plan actually costs the traveller.
 *
 * 「從釜山去滑雪合不合理」 is a question about distance, and distance is not
 * something to ask a language model. The minutes come from the routing service;
 * this file only turns them into the word a card can show. When routing cannot
 * answer — no coordinates, service down — the burden is left undefined and the
 * card says nothing, because a guessed 「交通負擔低」 is the sentence that puts
 * someone on a four-hour bus they did not plan for.
 */

import i18n from '../i18n/config';

export type TravelBurden = 'low' | 'medium' | 'high';

// i18n-data: read by index in `ActivityPlanCards`, which is outside this batch,
// so the table cannot become keys without changing that call site.
export const BURDEN_LABELS: Record<TravelBurden, string> = {
  low: '交通負擔低', // i18n-data: read by index in ActivityPlanCards, outside this batch
  medium: '交通負擔中等', // i18n-data: read by index in ActivityPlanCards, outside this batch
  high: '交通負擔高', // i18n-data: read by index in ActivityPlanCards, outside this batch
};

/**
 * @param minutes one-way travel time.
 */
export const travelBurden = (minutes: number | undefined): TravelBurden | undefined => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  if (minutes <= 60) return 'low';
  if (minutes <= 150) return 'medium';
  return 'high';
};

/** 「單程約 2 小時 10 分」, or nothing when routing had no answer. */
export const travelTimeLabel = (minutes: number | undefined): string => {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return i18n.t('activityPlan.travelTime.minutes', { minutes: rest });
  return rest === 0
    ? i18n.t('activityPlan.travelTime.hours', { hours })
    : i18n.t('activityPlan.travelTime.hoursMinutes', { hours, minutes: rest });
};

/**
 * Whether the travelling is physically sensible for a plan this long.
 *
 * Six hours of travelling leaves nothing of a day, and a plan that claims
 * otherwise is wrong in a way the traveller only discovers on the day itself.
 *
 * The first version let every multi-day plan through untouched — `days > 1`
 * returned true before the measured number was even looked at. So a 6-day
 * plan printing 「單程約 29 小時 21 分」 carried no warning at all, while the
 * same figure on a one-day plan would have been caught. The length of a plan
 * changes how much travelling it can absorb; it does not make a figure that
 * contradicts the destination acceptable.
 *
 * For a plan that sleeps somewhere the bar is deliberately loose. An overnight
 * trip five hours away is a real thing somebody would choose, and an existing
 * test says so on purpose — this check is not for 「有點遠」. It is for a figure
 * that says the place is not where the traveller is, which is what eight hours
 * of driving in one direction means for a trip to one city.
 */
const SINGLE_DAY_ROUND_TRIP_LIMIT = 360;
const MULTI_DAY_ONE_WAY_LIMIT = 480;

export const dayTripIsRealistic = (oneWayMinutes: number | undefined, days: number): boolean => {
  if (typeof oneWayMinutes !== 'number' || !Number.isFinite(oneWayMinutes)) return true;
  return days > 1
    ? oneWayMinutes <= MULTI_DAY_ONE_WAY_LIMIT
    : oneWayMinutes * 2 <= SINGLE_DAY_ROUND_TRIP_LIMIT;
};
