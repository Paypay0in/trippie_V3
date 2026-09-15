import { describe, expect, it } from 'vitest';
import { planTripDeletion } from './tripDeletion';
import { TripDraft } from './tripPersistence';

const draft = (id: string, name: string, updatedAt: string): TripDraft => ({
  id,
  name,
  destination: '釜山',
  startDate: '2026-09-14',
  endDate: '2026-09-20',
  expenses: [],
  companions: [],
  shoppingList: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt,
} as unknown as TripDraft);

/** §10: two trips that share a name and a destination. */
const A = draft('A', '釜山', '2026-09-10T00:00:00.000Z');
const B = draft('B', '釜山', '2026-09-12T00:00:00.000Z');
const C = draft('C', '東京', '2026-09-11T00:00:00.000Z');
const ALL = [A, B, C];

describe('§3 identity', () => {
  it('deletes exactly the trip whose stable id was given', () => {
    const plan = planTripDeletion(ALL, 'C', 'A');
    expect(plan.remainingDrafts.map(item => item.id)).toEqual(['B', 'C']);
    expect(plan.target?.id).toBe('A');
  });

  it('§10 leaves the same-named sibling untouched', () => {
    const plan = planTripDeletion(ALL, 'C', 'A');
    const survivor = plan.remainingDrafts.find(item => item.id === 'B');
    expect(survivor).toEqual(B);
    expect(plan.remainingDrafts.some(item => item.id === 'A')).toBe(false);
  });

  it('does not delete by array position', () => {
    // 'B' sits at index 1; deleting it must not take index 1 of some other order.
    expect(planTripDeletion(ALL, 'C', 'B').remainingDrafts.map(item => item.id)).toEqual(['A', 'C']);
  });

  it('deletes nothing when the id matches no trip', () => {
    const plan = planTripDeletion(ALL, 'C', 'missing');
    expect(plan.target).toBeUndefined();
    expect(plan.remainingDrafts).toBe(ALL);
    expect(plan.nextActiveDraftId).toBe('C');
  });

  it('preserves the order of the survivors', () => {
    expect(planTripDeletion(ALL, 'A', 'B').remainingDrafts.map(item => item.id)).toEqual(['A', 'C']);
  });
});

describe('§5 active trip safety', () => {
  it('keeps the active trip when a different trip is deleted', () => {
    const plan = planTripDeletion(ALL, 'C', 'A');
    expect(plan.nextActiveDraftId).toBe('C');
    expect(plan.draftToHydrate).toBeUndefined();
    expect(plan.clearWorkspace).toBe(false);
  });

  it('promotes the most recently updated survivor when the active trip is deleted', () => {
    const plan = planTripDeletion(ALL, 'A', 'A');
    expect(plan.nextActiveDraftId).toBe('B');
    expect(plan.draftToHydrate?.id).toBe('B');
    expect(plan.clearWorkspace).toBe(false);
  });

  it('never leaves the active id pointing at deleted data', () => {
    const plan = planTripDeletion(ALL, 'A', 'A');
    expect(plan.remainingDrafts.some(item => item.id === plan.nextActiveDraftId)).toBe(true);
  });

  it('falls back to the empty state when the last trip is deleted', () => {
    const plan = planTripDeletion([A], 'A', 'A');
    expect(plan.remainingDrafts).toEqual([]);
    expect(plan.nextActiveDraftId).toBeNull();
    expect(plan.clearWorkspace).toBe(true);
    expect(plan.draftToHydrate).toBeUndefined();
  });

  it('clears an already-stale active id rather than carrying it forward', () => {
    const plan = planTripDeletion(ALL, 'gone', 'A');
    expect(plan.nextActiveDraftId).toBeNull();
  });

  it('handles a missing updatedAt without crashing', () => {
    const undated = { ...C, updatedAt: undefined } as unknown as TripDraft;
    const plan = planTripDeletion([A, undated], 'A', 'A');
    expect(plan.nextActiveDraftId).toBe('C');
  });
});

describe('§6 scope', () => {
  it('touches only the trip collection it was given', () => {
    const before = JSON.stringify(ALL);
    planTripDeletion(ALL, 'A', 'A');
    // The input array and its members are never mutated in place.
    expect(JSON.stringify(ALL)).toBe(before);
  });
});
