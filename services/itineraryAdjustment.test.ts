import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import { TripPlanningInput, TripPlanningInspirationSelection } from './tripInspirationSelection';
import {
  analyzeExistingItinerary,
  applyItineraryAdjustment,
  buildExistingItinerarySnapshot,
  buildItineraryAdjustmentInput,
  ItineraryAdjustmentInput,
  ItineraryAdjustmentMode,
  normalizeItineraryAdjustment,
} from './itineraryAdjustment';

const TRIP_START = '2026-10-01';
const TRIP_END = '2026-10-03';

const item = (overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem => ({
  time: '09:00',
  title: overrides.location || 'Place',
  location: 'Place',
  notes: '',
  type: 'ACTIVITY',
  date: TRIP_START,
  ...overrides,
});

/** 甘川文化村 / 海雲台 / 國際市場, the Busan fixture from the ticket. */
const busanItinerary: ItineraryItem[] = [
  item({ id: 'it-gamcheon', time: '09:00', title: '甘川文化村', location: '甘川文化村', placeId: 'place-gamcheon', latitude: 35.0975, longitude: 129.0107, origin: 'saved_inspiration', sourceInspirationIds: ['insp-gamcheon'] }),
  item({ id: 'it-haeundae', time: '13:00', title: '海雲台', location: '海雲台', placeId: 'place-haeundae', latitude: 35.1587, longitude: 129.1604, origin: 'saved_inspiration', sourceInspirationIds: ['insp-haeundae'] }),
  item({ id: 'it-gukje', time: '17:00', title: '國際市場', location: '國際市場', placeId: 'place-gukje', latitude: 35.1010, longitude: 129.0263 }),
];

const selection = (overrides: Partial<TripPlanningInspirationSelection> & { groupId: string; placeName: string }): TripPlanningInspirationSelection => ({
  inspirationIds: [],
  experienceNotes: [],
  missingPlaceIdentity: false,
  ...overrides,
});

const baseInput = (mode: ItineraryAdjustmentMode, overrides: Partial<ItineraryAdjustmentInput> = {}): ItineraryAdjustmentInput => {
  const base: TripPlanningInput = {
    destination: '釜山',
    destinationCountry: '韓國',
    startDate: TRIP_START,
    endDate: TRIP_END,
    durationDays: 3,
    selections: [],
    ...overrides,
  };
  return { ...buildItineraryAdjustmentInput(base, mode, busanItinerary), ...overrides, adjustmentMode: mode };
};

describe('buildExistingItinerarySnapshot', () => {
  it('carries identity, schedule, geography and provenance for every item', () => {
    const snapshot = buildExistingItinerarySnapshot(busanItinerary);
    expect(snapshot).toHaveLength(3);
    const gamcheon = snapshot.find(entry => entry.id === 'it-gamcheon');
    expect(gamcheon).toMatchObject({
      id: 'it-gamcheon',
      date: TRIP_START,
      startTime: '09:00',
      placeName: '甘川文化村',
      placeId: 'place-gamcheon',
      provenance: 'saved_inspiration',
      locked: false,
    });
    expect(gamcheon?.coordinates).toEqual({ latitude: 35.0975, longitude: 129.0107 });
    expect(gamcheon?.sourceInspirationIds).toEqual(['insp-gamcheon']);
  });

  it('marks flight-anchor and expense-linked items as locked', () => {
    const snapshot = buildExistingItinerarySnapshot([
      item({ id: 'it-flight', location: '金海機場', derivedFromFlightAnchorId: 'anchor-1' }),
      item({ id: 'it-expense', location: '豬肉湯飯', linkedExpenseId: 'exp-1' }),
      item({ id: 'it-plain', location: '甘川文化村' }),
    ]);
    expect(snapshot.map(entry => [entry.id, entry.locked])).toEqual([
      ['it-flight', true],
      ['it-expense', true],
      ['it-plain', false],
    ]);
    expect(snapshot[0].provenance).toBe('flight_anchor');
    expect(snapshot[1].provenance).toBe('expense');
  });

  it('drops an item with no usable place name rather than inventing one', () => {
    expect(buildExistingItinerarySnapshot([item({ id: 'it-blank', title: '', location: '' })])).toEqual([]);
  });
});

describe('analyzeExistingItinerary', () => {
  it('reports empty days, long hops and unused saved inspirations', () => {
    const snapshot = buildExistingItinerarySnapshot(busanItinerary);
    const analysis = analyzeExistingItinerary(snapshot, {
      startDate: TRIP_START,
      endDate: TRIP_END,
      selections: [
        selection({ groupId: 'group-gamcheon', placeName: '甘川文化村', placeId: 'place-gamcheon', inspirationIds: ['insp-gamcheon'] }),
        selection({ groupId: 'group-spa', placeName: 'SPA LAND', inspirationIds: ['insp-spa'] }),
      ],
    });

    expect(analysis.emptyDates).toEqual(['2026-10-02', '2026-10-03']);
    expect(analysis.crowdedDates).toEqual([]);
    // 甘川文化村 -> 海雲台 is ~19km apart... the return leg to 國際市場 is the detour.
    expect(analysis.longHops.length).toBeGreaterThan(0);
    // Already-placed saved places are never re-suggested; only SPA LAND is unused.
    expect(analysis.unusedInspirationIds).toEqual(['insp-spa']);
  });

  it('lists items that have no start time', () => {
    const analysis = analyzeExistingItinerary(
      buildExistingItinerarySnapshot([item({ id: 'it-untimed', time: '', location: '松島天空步道' })]),
      { startDate: TRIP_START, endDate: TRIP_END },
    );
    expect(analysis.untimedItemIds).toEqual(['it-untimed']);
  });

  it('flags a crowded day', () => {
    const crowded = Array.from({ length: 6 }, (_, index) => item({ id: `it-${index}`, time: `0${index + 8}:00`, location: `Place ${index}` }));
    const analysis = analyzeExistingItinerary(buildExistingItinerarySnapshot(crowded), { startDate: TRIP_START, endDate: TRIP_END });
    expect(analysis.crowdedDates).toEqual([TRIP_START]);
  });
});

describe('normalizeItineraryAdjustment — ADD mode', () => {
  const input = baseInput('add');

  it('keeps adds and refuses every change that would touch an existing item', () => {
    const proposal = normalizeItineraryAdjustment({
      summary: '下午補一家咖啡廳。',
      changes: [
        { type: 'add', toDate: TRIP_START, proposedItem: { placeName: '黑房咖啡', suggestedStartTime: '14:00', note: '在國際市場附近', sourceInspirationIds: [] } },
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
        { type: 'remove', existingItemId: 'it-gukje' },
        { type: 'update', existingItemId: 'it-haeundae', durationMinutes: 60 },
      ],
    }, input);

    expect(proposal.changes.map(change => change.type)).toEqual(['add']);
    expect(proposal.changes[0].proposedItem?.placeName).toBe('黑房咖啡');
    expect(proposal.changes[0].proposedItem?.source).toBe('ai_suggestion');
    expect(proposal.warnings.join(' ')).toContain('只會新增');
  });

  it('never lets an add invent a placeId', () => {
    const proposal = normalizeItineraryAdjustment({
      changes: [{ type: 'add', toDate: TRIP_START, proposedItem: { placeName: '汗蒸幕', placeId: 'fake-place-id', sourceInspirationIds: [] } }],
    }, input);
    expect(proposal.changes[0].proposedItem?.placeId).toBeUndefined();
    expect(proposal.changes[0].proposedItem?.sourceInspirationIds).toEqual([]);
  });

  it('attaches saved-place identity only from a real inspiration id', () => {
    const withSelection = baseInput('add', {
      selections: [selection({ groupId: 'group-spa', placeName: 'SPA LAND Centum City', placeId: 'place-spa', inspirationIds: ['insp-spa'], coordinates: { latitude: 35.1689, longitude: 129.1291 } })],
    });
    const proposal = normalizeItineraryAdjustment({
      changes: [
        { type: 'add', toDate: '2026-10-02', proposedItem: { placeName: 'SPA LAND Centum City', suggestedStartTime: '15:30', sourceInspirationIds: ['insp-spa'] } },
        { type: 'add', toDate: '2026-10-02', proposedItem: { placeName: '海雲台', sourceInspirationIds: ['insp-not-real'] } },
      ],
    }, withSelection);

    expect(proposal.changes[0].proposedItem).toMatchObject({ placeId: 'place-spa', source: 'saved_inspiration', sourceInspirationIds: ['insp-spa'] });
    // 海雲台 claimed a bogus id, so it is an AI suggestion — and it is already in
    // the itinerary under that name, so it is dropped as a duplicate.
    expect(proposal.changes).toHaveLength(1);
  });

  it('does not recommend a place the itinerary already holds', () => {
    const withSelection = baseInput('add', {
      selections: [selection({ groupId: 'group-gamcheon', placeName: '甘川文化村', placeId: 'place-gamcheon', inspirationIds: ['insp-gamcheon'] })],
    });
    const proposal = normalizeItineraryAdjustment({
      changes: [{ type: 'add', toDate: '2026-10-02', proposedItem: { placeName: '甘川文化村', sourceInspirationIds: ['insp-gamcheon'] } }],
    }, withSelection);
    expect(proposal.changes).toEqual([]);
    expect(proposal.warnings.join(' ')).toContain('重複建議');
  });

  it('drops an add outside the trip date range', () => {
    const proposal = normalizeItineraryAdjustment({
      changes: [{ type: 'add', toDate: '2026-12-25', proposedItem: { placeName: '汗蒸幕', sourceInspirationIds: [] } }],
    }, input);
    expect(proposal.changes).toEqual([]);
    expect(proposal.warnings.join(' ')).toContain('旅程範圍外');
  });
});

describe('normalizeItineraryAdjustment — REORDER mode', () => {
  const input = baseInput('reorder');

  it('keeps moves and updates but refuses removals', () => {
    const proposal = normalizeItineraryAdjustment({
      summary: '配合 11 點後出門並調順動線。',
      changes: [
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30', reason: '配合「每天11點後出門」' },
        { type: 'move', existingItemId: 'it-gukje', toDate: TRIP_START, toTime: '15:00', reason: '和甘川文化村同一區' },
        { type: 'remove', existingItemId: 'it-haeundae', reason: '太遠' },
      ],
    }, input);

    expect(proposal.changes.map(change => change.type)).toEqual(['move', 'move']);
    expect(proposal.changes.some(change => change.type === 'remove')).toBe(false);
    expect(proposal.warnings.join(' ')).toContain('不允許');
  });

  it('fills from-date and from-time out of the snapshot, not the model', () => {
    const proposal = normalizeItineraryAdjustment({
      changes: [{ type: 'move', existingItemId: 'it-gamcheon', fromTime: '23:59', toTime: '11:30' }],
    }, input);
    expect(proposal.changes[0]).toMatchObject({ fromDate: TRIP_START, fromTime: '09:00', toTime: '11:30' });
  });

  it('keeps every existing item represented — no id disappears', () => {
    const proposal = normalizeItineraryAdjustment({
      changes: [
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
        { type: 'move', existingItemId: 'it-gukje', toTime: '15:00' },
      ],
    }, input);
    const result = applyItineraryAdjustment(busanItinerary, proposal, () => 'new-id');
    expect(result.items.map(entry => entry.id).sort()).toEqual(['it-gamcheon', 'it-gukje', 'it-haeundae']);
    expect(result.removedCount).toBe(0);
  });

  it('ignores a move that references an unknown or locked item', () => {
    const withLocked = baseInput('reorder');
    withLocked.existingItinerary = buildExistingItinerarySnapshot([
      ...busanItinerary,
      item({ id: 'it-flight', location: '金海機場', derivedFromFlightAnchorId: 'anchor-1' }),
    ]);
    const proposal = normalizeItineraryAdjustment({
      changes: [
        { type: 'move', existingItemId: 'it-does-not-exist', toTime: '10:00' },
        { type: 'move', existingItemId: 'it-flight', toTime: '10:00' },
      ],
    }, withLocked);
    expect(proposal.changes).toEqual([]);
    expect(proposal.warnings.join(' ')).toContain('不存在');
    expect(proposal.warnings.join(' ')).toContain('航班錨點');
  });

  it('drops a no-op move', () => {
    const proposal = normalizeItineraryAdjustment({
      changes: [{ type: 'move', existingItemId: 'it-gamcheon', toDate: TRIP_START, toTime: '09:00' }],
    }, input);
    expect(proposal.changes).toEqual([]);
  });

  it('accepts only the first change per existing item', () => {
    const proposal = normalizeItineraryAdjustment({
      changes: [
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '19:00' },
      ],
    }, input);
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0].toTime).toBe('11:30');
  });
});

describe('normalizeItineraryAdjustment — REPLAN mode', () => {
  const input = baseInput('replan');

  it('allows every change type and keeps removals explicit', () => {
    const proposal = normalizeItineraryAdjustment({
      summary: '重新安排三天動線。',
      changes: [
        { type: 'add', toDate: '2026-10-02', proposedItem: { placeName: '松島天空步道', suggestedStartTime: '10:00', sourceInspirationIds: [] } },
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
        { type: 'update', existingItemId: 'it-haeundae', durationMinutes: 120, note: '傍晚看海' },
        { type: 'remove', existingItemId: 'it-gukje', reason: '動線太繞' },
      ],
    }, input);

    expect(proposal.changes.map(change => change.type)).toEqual(['add', 'move', 'update', 'remove']);
    const removal = proposal.changes.find(change => change.type === 'remove');
    // A removal is fully described, so the preview can name what disappears.
    expect(removal).toMatchObject({ existingItemId: 'it-gukje', fromDate: TRIP_START, fromTime: '17:00', reason: '動線太繞' });
  });

  it('still refuses to remove a locked item', () => {
    const withLocked = baseInput('replan');
    withLocked.existingItinerary = buildExistingItinerarySnapshot([
      ...busanItinerary,
      item({ id: 'it-expense', location: '豬肉湯飯', linkedExpenseId: 'exp-1' }),
    ]);
    const proposal = normalizeItineraryAdjustment({
      changes: [{ type: 'remove', existingItemId: 'it-expense' }],
    }, withLocked);
    expect(proposal.changes).toEqual([]);
    expect(proposal.warnings.join(' ')).toContain('已連結支出');
  });
});

describe('applyItineraryAdjustment', () => {
  it('applies adds, moves, updates and removals by stable item id', () => {
    let counter = 0;
    const result = applyItineraryAdjustment(busanItinerary, {
      mode: 'replan',
      summary: '',
      warnings: [],
      changes: [
        { type: 'add', toDate: '2026-10-02', toTime: '15:30', proposedItem: { id: 'p1', placeName: 'SPA LAND', suggestedStartTime: '15:30', durationMinutes: 120, note: '汗蒸幕', sourceInspirationIds: [], source: 'ai_suggestion' } },
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
        { type: 'update', existingItemId: 'it-haeundae', updatedDurationMinutes: 120, updatedNote: '傍晚看海' },
        { type: 'remove', existingItemId: 'it-gukje' },
      ],
    }, () => `new-${++counter}`);

    expect(result).toMatchObject({ addedCount: 1, movedCount: 1, updatedCount: 1, removedCount: 1 });
    expect(result.items.map(entry => entry.id)).toEqual(['it-gamcheon', 'it-haeundae', 'new-1']);
    expect(result.items.find(entry => entry.id === 'it-gamcheon')?.time).toBe('11:30');
    expect(result.items.find(entry => entry.id === 'it-haeundae')).toMatchObject({ durationMinutes: 120, notes: '傍晚看海' });

    const added = result.items.find(entry => entry.id === 'new-1');
    expect(added).toMatchObject({ date: '2026-10-02', time: '15:30', title: 'SPA LAND', origin: 'ai_suggestion', type: 'ACTIVITY' });
    expect(added?.sourceInspirationIds).toBeUndefined();
  });

  it('preserves an existing item untouched by any change', () => {
    const result = applyItineraryAdjustment(busanItinerary, {
      mode: 'reorder', summary: '', warnings: [],
      changes: [{ type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' }],
    }, () => 'new-id');
    expect(result.items.find(entry => entry.id === 'it-haeundae')).toEqual(busanItinerary[1]);
  });

  it('enforces the mode a second time, so a hand-built proposal cannot delete in add mode', () => {
    const result = applyItineraryAdjustment(busanItinerary, {
      mode: 'add', summary: '', warnings: [],
      changes: [
        { type: 'remove', existingItemId: 'it-gukje' },
        { type: 'move', existingItemId: 'it-gamcheon', toTime: '11:30' },
      ],
    }, () => 'new-id');
    expect(result.items).toHaveLength(3);
    expect(result.removedCount).toBe(0);
    expect(result.items.find(entry => entry.id === 'it-gamcheon')?.time).toBe('09:00');
  });

  it('never identifies an existing item by place name', () => {
    const duplicateNames: ItineraryItem[] = [
      item({ id: 'it-a', location: '國際市場', time: '09:00' }),
      item({ id: 'it-b', location: '國際市場', time: '17:00' }),
    ];
    const result = applyItineraryAdjustment(duplicateNames, {
      mode: 'replan', summary: '', warnings: [],
      changes: [{ type: 'remove', existingItemId: 'it-b' }],
    }, () => 'new-id');
    expect(result.items.map(entry => entry.id)).toEqual(['it-a']);
  });

  it('skips a change whose target vanished between preview and apply', () => {
    const result = applyItineraryAdjustment([busanItinerary[0]], {
      mode: 'replan', summary: '', warnings: [],
      changes: [{ type: 'remove', existingItemId: 'it-gukje' }],
    }, () => 'new-id');
    expect(result.items).toHaveLength(1);
    expect(result.removedCount).toBe(0);
  });

  it('refuses to touch a locked item even when the proposal names it', () => {
    const withLocked = [...busanItinerary, item({ id: 'it-flight', time: '20:00', location: '金海機場', derivedFromFlightAnchorId: 'anchor-1' })];
    const result = applyItineraryAdjustment(withLocked, {
      mode: 'replan', summary: '', warnings: [],
      changes: [
        { type: 'remove', existingItemId: 'it-flight' },
        { type: 'move', existingItemId: 'it-flight', toTime: '06:00' },
      ],
    }, () => 'new-id');
    expect(result.items.find(entry => entry.id === 'it-flight')?.time).toBe('20:00');
    expect(result.removedCount).toBe(0);
  });
});

describe('buildItineraryAdjustmentInput', () => {
  it('hands the AI the existing itinerary and its analysis', () => {
    const input = buildItineraryAdjustmentInput({
      destination: '釜山', startDate: TRIP_START, endDate: TRIP_END, durationDays: 3, selections: [],
    }, 'reorder', busanItinerary);

    expect(input.adjustmentMode).toBe('reorder');
    expect(input.existingItinerary.map(entry => entry.id)).toEqual(['it-gamcheon', 'it-haeundae', 'it-gukje']);
    expect(input.analysis.emptyDates).toEqual(['2026-10-02', '2026-10-03']);
  });
});

/**
 * Which days still need planning.
 *
 * `emptyDates` answers "is anything on this day", which is not the question a
 * traveller with a booked flight and a booked hotel is asking. Arrival day
 * always holds both, so a trip with nothing planned at all looked mostly full.
 */
describe('unplannedDates', () => {
  const anchoredDay = (date: string): ItineraryItem[] => [
    item({ id: `flight-${date}`, date, time: '20:15', title: '航班抵達', location: '金海國際機場', scheduleFlexibility: 'fixed', fixedEventKind: 'flight' } as Partial<ItineraryItem> & { id: string }),
    item({ id: `stay-${date}`, date, time: '22:15', title: '入住 廣安里凱星頓特酒店', location: '廣安里', fixedEventKind: 'accommodation' } as Partial<ItineraryItem> & { id: string }),
  ];

  const analyse = (itinerary: ItineraryItem[]) =>
    analyzeExistingItinerary(buildExistingItinerarySnapshot(itinerary), {
      startDate: TRIP_START,
      endDate: TRIP_END,
    });

  it('counts a day holding only a flight and a hotel as unplanned', () => {
    // The whole reason 把空白的日子排滿 exists: this day reads as busy to
    // emptyDates and has nothing on it the traveller chose.
    const analysis = analyse(anchoredDay(TRIP_START));

    expect(analysis.unplannedDates).toContain(TRIP_START);
    expect(analysis.emptyDates).not.toContain(TRIP_START);
  });

  it('stops counting the day once something is actually planned on it', () => {
    const analysis = analyse([
      ...anchoredDay(TRIP_START),
      item({ id: 'it-gamcheon', date: TRIP_START, time: '09:00', location: '甘川文化村' }),
    ]);

    expect(analysis.unplannedDates).not.toContain(TRIP_START);
  });

  it('still includes the days that hold nothing at all', () => {
    // Otherwise the mode would skip exactly the days most in need of it.
    const analysis = analyse(anchoredDay(TRIP_START));

    expect(analysis.unplannedDates).toEqual([TRIP_START, '2026-10-02', TRIP_END]);
  });
});
