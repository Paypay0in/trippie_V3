import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import {
  applyItineraryAdjustment,
  buildExistingItinerarySnapshot,
  isLockedItineraryItem,
  isPinnedItineraryItem,
  normalizeItineraryAdjustment,
  ItineraryAdjustmentProposal,
  PINNED_CONFLICT_WARNING,
  buildItineraryAdjustmentInput,
} from './itineraryAdjustment';

/** §10 fixture: 海雲台 / 餐廳予約 [PINNED] / 廣安里. */
const item = (overrides: Partial<ItineraryItem> & Pick<ItineraryItem, 'id' | 'title'>): ItineraryItem => ({
  time: '',
  location: overrides.title,
  notes: '',
  type: 'ACTIVITY',
  date: '2026-09-15',
  isCompleted: false,
  ...overrides,
});

const FIXTURE: ItineraryItem[] = [
  item({ id: 'it-haeundae', title: '海雲台', time: '14:00' }),
  item({ id: 'it-dinner', title: '餐廳予約', time: '19:00', isPinned: true }),
  item({ id: 'it-gwangalli', title: '廣安里', time: '21:00' }),
];

const snapshot = () => buildExistingItinerarySnapshot(FIXTURE);

const TRIP = {
  destination: '釜山',
  destinationCountry: '韓國',
  startDate: '2026-09-14',
  endDate: '2026-09-20',
  durationDays: 7,
  selections: [],
};

const inputFor = (mode: 'add' | 'reorder' | 'replan', itinerary: ItineraryItem[] = FIXTURE) => ({
  ...buildItineraryAdjustmentInput(TRIP, mode, itinerary),
  adjustmentMode: mode,
});

const proposalFrom = (mode: 'add' | 'reorder' | 'replan', changes: unknown[]) =>
  normalizeItineraryAdjustment({ changes, summary: 'test' }, inputFor(mode));

describe('pin data contract', () => {
  it('defaults to not pinned', () => {
    expect(FIXTURE[0].isPinned).toBeUndefined();
    expect(isPinnedItineraryItem(FIXTURE[0])).toBe(false);
  });

  it('treats a pinned item as locked for the planner', () => {
    expect(isLockedItineraryItem(FIXTURE[1])).toBe(true);
    expect(isPinnedItineraryItem(FIXTURE[1])).toBe(true);
  });

  it('does not confuse a pin with a fixed event', () => {
    const snap = snapshot().find(entry => entry.id === 'it-dinner');
    expect(snap?.isPinned).toBe(true);
    expect(snap?.fixedEvent).toBeUndefined();
  });
});

describe('AI input includes pinned state', () => {
  it('marks only the pinned item', () => {
    expect(snapshot().map(entry => entry.isPinned)).toEqual([undefined, true, undefined]);
  });

  it('reports the pinned item as locked to the AI', () => {
    expect(snapshot().find(entry => entry.id === 'it-dinner')?.locked).toBe(true);
  });
});

describe('normalization rejects changes to a pinned item', () => {
  it('補充行程 leaves a pinned item untouched', () => {
    const result = proposalFrom('add', [
      { type: 'move', existingItemId: 'it-dinner', toDate: '2026-09-16', toTime: '12:00', reason: 'x' },
    ]);
    expect(result.changes).toHaveLength(0);
  });

  it('重新安排路線 may move the flexible items but not the pin', () => {
    const result = proposalFrom('reorder', [
      { type: 'move', existingItemId: 'it-haeundae', toDate: '2026-09-15', toTime: '10:00', reason: 'x' },
      { type: 'move', existingItemId: 'it-dinner', toDate: '2026-09-15', toTime: '17:00', reason: 'x' },
      { type: 'move', existingItemId: 'it-gwangalli', toDate: '2026-09-15', toTime: '21:30', reason: 'x' },
    ]);
    expect(result.changes.map(change => change.existingItemId)).toEqual(['it-haeundae', 'it-gwangalli']);
    expect(result.warnings).toContain(PINNED_CONFLICT_WARNING);
  });

  it('重新規劃 cannot remove a pinned item', () => {
    const result = proposalFrom('replan', [
      { type: 'remove', existingItemId: 'it-dinner', reason: 'x' },
    ]);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings).toContain(PINNED_CONFLICT_WARNING);
  });

  it('重新規劃 cannot retime a pinned item', () => {
    const result = proposalFrom('replan', [
      { type: 'update', existingItemId: 'it-dinner', toTime: '20:00', reason: 'x' },
    ]);
    expect(result.changes).toHaveLength(0);
  });

  it('does not warn about pins when nothing touched one', () => {
    const result = proposalFrom('reorder', [
      { type: 'move', existingItemId: 'it-haeundae', toDate: '2026-09-15', toTime: '10:00', reason: 'x' },
    ]);
    expect(result.warnings).not.toContain(PINNED_CONFLICT_WARNING);
  });
});

describe('apply-time protection against stale proposals', () => {
  /** A hand-built proposal that bypassed normalization entirely. */
  const hostileProposal = (mode: 'reorder' | 'replan'): ItineraryAdjustmentProposal => ({
    mode,
    summary: 'stale',
    warnings: [],
    changes: [
      { type: 'move', existingItemId: 'it-dinner', toDate: '2026-09-17', toTime: '09:00', reason: 'x' },
      { type: 'move', existingItemId: 'it-gwangalli', toDate: '2026-09-15', toTime: '22:00', reason: 'x' },
    ],
  });

  it('refuses to move a pinned item even from a proposal built by hand', () => {
    const result = applyItineraryAdjustment(FIXTURE, hostileProposal('reorder'), () => 'new-id');
    const dinner = result.items.find(entry => entry.id === 'it-dinner');
    expect(dinner?.time).toBe('19:00');
    expect(dinner?.date).toBe('2026-09-15');
    expect(result.movedCount).toBe(1);
    expect(result.pinnedConflictCount).toBe(1);
  });

  it('§11 protects an item pinned AFTER the proposal was generated', () => {
    // The proposal is normalized while nothing is pinned, so it legitimately
    // contains a move for 廣安里 and 餐廳予約.
    const unpinned = FIXTURE.map(entry => ({ ...entry, isPinned: undefined }));
    const proposal = normalizeItineraryAdjustment(
      {
        changes: [
          { type: 'move', existingItemId: 'it-dinner', toDate: '2026-09-15', toTime: '17:00', reason: 'x' },
          { type: 'move', existingItemId: 'it-gwangalli', toDate: '2026-09-15', toTime: '22:00', reason: 'x' },
        ],
        summary: 'ok',
      },
      inputFor('reorder', unpinned),
    );
    expect(proposal.changes).toHaveLength(2);

    // The user then pins the dinner and only afterwards presses 套用這些調整.
    const result = applyItineraryAdjustment(FIXTURE, proposal, () => 'new-id');
    expect(result.items.find(entry => entry.id === 'it-dinner')?.time).toBe('19:00');
    expect(result.items.find(entry => entry.id === 'it-gwangalli')?.time).toBe('22:00');
    expect(result.pinnedConflictCount).toBe(1);
  });

  it('never removes a pinned item at apply time', () => {
    const result = applyItineraryAdjustment(
      FIXTURE,
      { mode: 'replan', summary: 's', warnings: [], changes: [{ type: 'remove', existingItemId: 'it-dinner', reason: 'x' }] },
      () => 'new-id',
    );
    expect(result.items.map(entry => entry.id)).toContain('it-dinner');
    expect(result.removedCount).toBe(0);
    expect(result.pinnedConflictCount).toBe(1);
  });

  it('reports no pin conflict when the proposal respected the pin', () => {
    const result = applyItineraryAdjustment(
      FIXTURE,
      { mode: 'reorder', summary: 's', warnings: [], changes: [{ type: 'move', existingItemId: 'it-haeundae', toDate: '2026-09-15', toTime: '10:00', reason: 'x' }] },
      () => 'new-id',
    );
    expect(result.pinnedConflictCount).toBe(0);
    expect(result.movedCount).toBe(1);
  });
});
