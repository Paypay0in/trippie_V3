import { describe, expect, it } from 'vitest';
import { ActivityPlanProposal, planToItineraryItems } from './activityPlanProposal';

let counter = 0;
const generateId = () => `id-${(counter += 1)}`;

const plan: ActivityPlanProposal = {
  id: 'opt-1',
  title: '初學者輕鬆一日滑雪',
  whyItFits: '',
  durationDays: 1,
  characteristics: ['easiest'],
  logistics: {},
  budgetConfidence: 'unverified',
  preparation: [],
  items: [
    { dayOffset: 0, time: '14:00', title: '初級雪道練習', type: 'ACTIVITY' },
    {
      dayOffset: 0,
      time: '10:30',
      title: '租借雪具',
      type: 'ACTIVITY',
      placeName: 'Eden Valley Ski Resort',
      placeId: 'places/abc',
      address: '梁山市院東面',
      latitude: 35.4,
      longitude: 129.0,
      durationMinutes: 30,
    },
  ],
};

describe('plan to itinerary items', () => {
  it('orders by day then time', () => {
    const items = planToItineraryItems(plan, { startDate: '2027-01-11', generateId });
    expect(items.map(item => item.title)).toEqual(['租借雪具', '初級雪道練習']);
  });

  it('dates against the day the traveller chose', () => {
    // The planner knows the shape of the plan, never when this trip runs.
    const items = planToItineraryItems(plan, { startDate: '2027-01-11', generateId });
    expect(items.every(item => item.date === '2027-01-11')).toBe(true);
  });

  it('spreads a multi-day plan across consecutive days', () => {
    const overnight = { ...plan, items: [...plan.items, { dayOffset: 1, time: '09:00', title: '第二天滑雪', type: 'ACTIVITY' as const }] };
    const items = planToItineraryItems(overnight, { startDate: '2027-01-11', generateId });
    expect(items[2].date).toBe('2027-01-12');
  });

  it('carries identity only where the map service supplied it', () => {
    // An item must never hold a placeId nobody looked up.
    const items = planToItineraryItems(plan, { startDate: '2027-01-11', generateId });
    expect(items[0].placeId).toBe('places/abc');
    expect(items[0].latitude).toBe(35.4);
    expect(items[1].placeId).toBeUndefined();
    expect(items[1].address).toBeUndefined();
  });

  it('claims no saved-inspiration provenance', () => {
    const items = planToItineraryItems(plan, { startDate: '2027-01-11', generateId });
    expect(items.every(item => item.sourceInspirationIds?.length === 0)).toBe(true);
  });

  it('leaves items undated rather than inventing a day', () => {
    expect(planToItineraryItems(plan, { generateId }).every(item => item.date === undefined)).toBe(true);
  });
});
