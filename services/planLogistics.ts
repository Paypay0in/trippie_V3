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

export type TravelBurden = 'low' | 'medium' | 'high';

export const BURDEN_LABELS: Record<TravelBurden, string> = {
  low: '交通負擔低',
  medium: '交通負擔中等',
  high: '交通負擔高',
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
  if (hours === 0) return `單程約 ${rest} 分鐘`;
  return rest === 0 ? `單程約 ${hours} 小時` : `單程約 ${hours} 小時 ${rest} 分`;
};

/**
 * Whether a day trip is even physically sensible.
 *
 * Six hours of travelling leaves nothing of a day, and a plan that claims
 * otherwise is wrong in a way the traveller only discovers on the day itself.
 */
export const dayTripIsRealistic = (oneWayMinutes: number | undefined, days: number): boolean => {
  if (days > 1) return true;
  if (typeof oneWayMinutes !== 'number' || !Number.isFinite(oneWayMinutes)) return true;
  return oneWayMinutes * 2 <= 360;
};
