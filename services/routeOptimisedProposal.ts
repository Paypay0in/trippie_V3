/**
 * The AI's proposal, run through the route planner before anybody sees it.
 *
 * `optimiseTripRoute` clusters stops by area, assigns areas to days, keeps
 * meals in their windows and pulls apart overlapping times. It is good, it is
 * deterministic, and it costs nothing — and it was wired to one button,
 * 「重排行程」, which somebody has to notice is needed and go and press. Most
 * people will not press it. They will look at a day that criss-crosses the
 * city and decide this app plans badly.
 *
 * So the plan the model returns is routed before it is shown.
 *
 * **Before it is shown, not after it is accepted.** That ordering is the whole
 * point. Optimising at acceptance would mean the preview says one thing and
 * the trip that gets created says another — the traveller approved a Tuesday
 * and woke up to a Wednesday. This codebase has made that mistake in other
 * shapes often enough: never display one answer and store a different one.
 */
import { ItineraryItem } from '../types';
import { TripInspirationProposal } from './itineraryPlanningService';
import { optimiseTripRoute } from './optimiseTripRoute';

export interface ProposalRouteResult {
  proposal: TripInspirationProposal;
  /** How many stops the route planner moved, for saying whether it did anything. */
  moved: number;
  /** Kilometres walked across the whole trip, before and after. */
  beforeKm: number;
  afterKm: number;
}

/**
 * Proposal items as itinerary items, which is what the route planner reads.
 *
 * `type` is `ACTIVITY` for everything, as it is on acceptance: the proposal
 * carries no typing, and inventing FOOD from a name here would be a second
 * guess at something `categoryOf` already answers from the resolved place.
 */
const asItineraryItems = (proposal: TripInspirationProposal): ItineraryItem[] =>
  proposal.days.flatMap(day => day.items.map(item => ({
    id: item.id,
    date: day.date,
    time: item.suggestedStartTime || '',
    title: item.placeName,
    location: item.placeName,
    notes: item.note || '',
    type: 'ACTIVITY' as const,
    ...(item.placeId ? { placeId: item.placeId } : {}),
    ...(item.address ? { address: item.address } : {}),
    ...(item.coordinates ? {
      latitude: item.coordinates.latitude,
      longitude: item.coordinates.longitude,
    } : {}),
    ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}),
  })));

/**
 * Route a proposal, keeping every original item object.
 *
 * Only `date` and `suggestedStartTime` are taken from the plan. Everything
 * else on a proposal item — the place id, the coordinates, the experience
 * notes that prove which saved place it came from — is carried through
 * untouched, because rebuilding it here would be a second place for those
 * facts to be assembled, and the second one always ends up doing less.
 *
 * A stop the planner could not place （no coordinates yet） keeps the day and
 * the time the model gave it. Dropping it would silently shorten a trip the
 * traveller is about to approve.
 */
export const routeOptimisedProposal = (
  proposal: TripInspirationProposal,
  options: { country?: string; dayStart?: string; categoryOf?: (item: ItineraryItem) => string | undefined } = {},
): ProposalRouteResult => {
  const items = asItineraryItems(proposal);
  if (items.length === 0) {
    return { proposal, moved: 0, beforeKm: 0, afterKm: 0 };
  }

  const plan = optimiseTripRoute(items, options);
  const placed = new Map(plan.days.flatMap(day =>
    day.items.map(item => [item.id, { date: day.date, time: item.time }] as const)));

  if (placed.size === 0) {
    return { proposal, moved: 0, beforeKm: plan.beforeKm, afterKm: plan.afterKm };
  }

  const original = new Map(items.map(item => [item.id, item]));
  let moved = 0;

  /*
    Rebuilt from the dates the plan produced, which may differ from the ones
    the model used — a stop moved to another day has to leave the day it was
    on, or it would appear twice.
  */
  const byDate = new Map<string, TripInspirationProposal['days'][number]['items']>();
  proposal.days.forEach(day => {
    day.items.forEach(item => {
      const where = placed.get(item.id);
      const date = where?.date || day.date;
      const time = where ? where.time : item.suggestedStartTime;
      const was = original.get(item.id);
      if (was && (was.date !== date || (was.time || '') !== (time || ''))) moved += 1;
      byDate.set(date, [
        ...(byDate.get(date) || []),
        { ...item, ...(time ? { suggestedStartTime: time } : {}) },
      ]);
    });
  });

  const days = Array.from(byDate.entries())
    .map(([date, dayItems]) => ({
      date,
      // Within a day, the order is the clock. A list that reads out of order
      // is the thing somebody notices before they notice anything else.
      items: dayItems
        .slice()
        .sort((left, right) => (left.suggestedStartTime || '').localeCompare(right.suggestedStartTime || '')),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return { proposal: { ...proposal, days }, moved, beforeKm: plan.beforeKm, afterKm: plan.afterKm };
};
