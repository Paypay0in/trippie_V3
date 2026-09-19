import { ItineraryItem } from '../types';

/**
 * Which days of this trip a new activity could actually go into.
 *
 * A planner that proposes a full ski day on a date already holding a pinned
 * restaurant booking has not understood the trip. Computed from the itinerary
 * rather than asked of the model: the dates are known, and counting them is not
 * a judgement call.
 *
 * Pinned items are a hard constraint — 📌 means the AI may not move, retime or
 * displace it — so a day holding one is never offered as free. A day with
 * ordinary items is offered as 「已有安排」 rather than hidden, because the
 * traveller may well want to replace a loose afternoon.
 */

export interface TripDay {
  date: string;
  /** Items already on it. */
  itemCount: number;
  /** Holds something the AI may not touch. */
  hasPinned: boolean;
  /** Nothing on it at all. */
  isFree: boolean;
}

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const tripDays = ({
  startDate,
  endDate,
  itinerary,
}: {
  startDate?: string;
  endDate?: string;
  itinerary: ItineraryItem[];
}): TripDay[] => {
  if (!startDate || !endDate) return [];
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  const span = Math.round((end - start) / 86400000);
  // A "trip" of several years is a typo in the dates, not a trip; walking it
  // day by day would hang the screen.
  if (span > 120) return [];

  return Array.from({ length: span + 1 }, (_, offset) => {
    const date = addDays(startDate, offset);
    const onThisDay = itinerary.filter(item => item.date === date);
    return {
      date,
      itemCount: onThisDay.length,
      hasPinned: onThisDay.some(item => item.isPinned === true),
      isFree: onThisDay.length === 0,
    };
  });
};

/** A line for the planner describing what the trip's days already hold. */
export const tripDaysBrief = (days: TripDay[]): string => {
  if (days.length === 0) return '';
  const free = days.filter(day => day.isFree).map(day => day.date);
  const pinned = days.filter(day => day.hasPinned).map(day => day.date);
  const parts = [`這趟旅程共 ${days.length} 天。`];
  parts.push(free.length > 0 ? `完全空著的日期：${free.join('、')}。` : '沒有完全空著的日期。');
  if (pinned.length > 0) {
    parts.push(`以下日期有使用者固定住的行程，不要安排會佔掉整天的方案：${pinned.join('、')}。`);
  }
  return parts.join('');
};

/**
 * Days a plan of this length would need, and whether that collides with
 * something pinned. Reported, never resolved silently — the traveller decides
 * what gives.
 */
export const pinnedConflictDates = (days: TripDay[], startDate: string, durationDays: number): string[] => {
  const wanted = Array.from({ length: Math.max(1, durationDays) }, (_, offset) => addDays(startDate, offset));
  return days.filter(day => day.hasPinned && wanted.includes(day.date)).map(day => day.date);
};
