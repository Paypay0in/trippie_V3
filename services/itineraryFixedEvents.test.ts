import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import {
  applyFixedEventAdjustment,
  buildFixedEventAdjustment,
  computeDepartureBoundary,
  DAY_START_FLOOR_MINUTES,
  DEFAULT_AIRPORT_ARRIVAL_BUFFER_MINUTES,
  detectFixedEventConflicts,
  FALLBACK_AIRPORT_TRANSIT_MINUTES,
  fixedKindOf,
  isAirportArrivalStep,
  isFixedItem,
  isFlexibleItem,
  nextFixedBoundaryAfter,
  describeUnresolvedConflicts,
  FixedEventConflict,
} from './itineraryFixedEvents';
import { rescheduleFromItem, timeToMinutes } from './itineraryTimeline';

const DAY_5 = '2026-10-05';
const DAY_6 = '2026-10-06';

const item = (overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem => ({
  time: '09:00',
  title: overrides.location || overrides.id,
  location: overrides.location || overrides.id,
  notes: '',
  type: 'ACTIVITY',
  date: DAY_6,
  ...overrides,
});

const flight = (overrides: Partial<ItineraryItem> = {}): ItineraryItem => item({
  id: 'it-flight',
  time: '18:00',
  durationMinutes: 0,
  location: '釜山 → 台北',
  type: 'FLIGHT',
  scheduleFlexibility: 'fixed',
  fixedEventKind: 'flight',
  ...overrides,
});

/** §13: 11:00 白淺灘 (120) · 14:00 太宗臺 (120) · 17:00 P.ARK (90) */
const day6 = (): ItineraryItem[] => [
  item({ id: 'it-a', time: '11:00', durationMinutes: 120, location: '白淺灘文化村' }),
  item({ id: 'it-b', time: '14:00', durationMinutes: 120, location: '太宗臺' }),
  item({ id: 'it-c', time: '17:00', durationMinutes: 90, location: 'P.ARK' }),
];

/** A 15:00 boundary: 18:00 flight − 120 check-in − 60 transit. */
const boundaryContext = { transitMinutesByFixedId: { 'it-flight': 60 } };

describe('the flexibility model', () => {
  it('treats an unmarked activity as flexible', () => {
    expect(isFlexibleItem(item({ id: 'it-a' }))).toBe(true);
    expect(isFixedItem(item({ id: 'it-a' }))).toBe(false);
  });

  it('treats an explicitly fixed event as fixed', () => {
    expect(isFixedItem(flight())).toBe(true);
    expect(fixedKindOf(flight())).toBe('flight');
    const booking = item({ id: 'it-r', scheduleFlexibility: 'fixed', fixedEventKind: 'reservation' });
    expect(isFixedItem(booking)).toBe(true);
    expect(fixedKindOf(booking)).toBe('reservation');
  });

  it('treats a flight-anchor item as fixed even without the flag', () => {
    // These predate the model and were always hard constraints.
    const anchor = item({ id: 'it-anchor', derivedFromFlightAnchorId: 'anchor-1', type: 'FLIGHT' });
    expect(isFixedItem(anchor)).toBe(true);
    expect(fixedKindOf(anchor)).toBe('flight');
  });

  it('supports kinds beyond flights, without flight-specific logic', () => {
    (['train', 'reservation', 'ticketed_event'] as const).forEach(kind => {
      expect(fixedKindOf(item({ id: `it-${kind}`, scheduleFlexibility: 'fixed', fixedEventKind: kind }))).toBe(kind);
    });
  });
});

describe('computeDepartureBoundary', () => {
  it('subtracts both check-in and travel from the departure time', () => {
    // 18:00 − 120 check-in − 60 travel = 15:00. Not 17:59.
    const boundary = computeDepartureBoundary({
      eventStartMinutes: timeToMinutes('18:00')!,
      arrivalBufferMinutes: 120,
      transitMinutes: 60,
    });
    expect(boundary.mustLeaveByMinutes).toBe(timeToMinutes('15:00'));
    expect(boundary.estimated).toBe(false);
  });

  it('falls back conservatively and says the travel time was estimated', () => {
    const boundary = computeDepartureBoundary({ eventStartMinutes: timeToMinutes('18:00')! });
    expect(boundary.estimated).toBe(true);
    expect(boundary.mustLeaveByMinutes).toBe(
      timeToMinutes('18:00')! - DEFAULT_AIRPORT_ARRIVAL_BUFFER_MINUTES - FALLBACK_AIRPORT_TRANSIT_MINUTES,
    );
  });

  it('uses the flight\'s own buffer when it has one', () => {
    const boundary = computeDepartureBoundary({
      eventStartMinutes: timeToMinutes('18:00')!,
      arrivalBufferMinutes: 180,
      transitMinutes: 30,
    });
    expect(boundary.mustLeaveByMinutes).toBe(timeToMinutes('14:30'));
  });

  it('never produces a negative boundary', () => {
    expect(computeDepartureBoundary({ eventStartMinutes: 30 }).mustLeaveByMinutes).toBe(0);
  });
});

describe('detectFixedEventConflicts', () => {
  it('finds the activities that cannot survive an 18:00 flight', () => {
    const conflicts = detectFixedEventConflicts([...day6(), flight()], boundaryContext);
    // 太宗臺 runs to 16:00 and P.ARK to 18:30 — both past the 15:00 deadline.
    expect(conflicts.map(conflict => conflict.itemId).sort()).toEqual(['it-b', 'it-c']);
    expect(conflicts.every(conflict => conflict.boundaryMinutes === timeToMinutes('15:00'))).toBe(true);
  });

  it('leaves a day that already fits alone', () => {
    const early = [
      item({ id: 'it-a', time: '09:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '12:00', durationMinutes: 120 }),
    ];
    expect(detectFixedEventConflicts([...early, flight()], boundaryContext)).toEqual([]);
  });

  it('flags an activity that overlaps the fixed event itself', () => {
    const late = [item({ id: 'it-late', time: '17:30', durationMinutes: 60 })];
    const conflicts = detectFixedEventConflicts([...late, flight()], boundaryContext);
    expect(conflicts[0]).toMatchObject({ kind: 'overlaps-fixed', itemId: 'it-late' });
  });

  it('reports a fixed-versus-fixed clash rather than resolving it', () => {
    // §14: a 16:30 reservation and an 18:00 flight cannot both happen.
    const reservation = item({
      id: 'it-res', time: '16:30', durationMinutes: 90,
      scheduleFlexibility: 'fixed', fixedEventKind: 'reservation', location: '餐廳訂位',
    });
    const conflicts = detectFixedEventConflicts([reservation, flight()], boundaryContext);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'fixed-vs-fixed', itemId: 'it-res', fixedItemId: 'it-flight' });
  });

  it('says nothing when the day holds no fixed event', () => {
    expect(detectFixedEventConflicts(day6())).toEqual([]);
  });

  it('treats a reservation as a time to be there, not a journey', () => {
    // No check-in or travel is subtracted from a booked table.
    const reservation = item({
      id: 'it-res', time: '19:00', durationMinutes: 90,
      scheduleFlexibility: 'fixed', fixedEventKind: 'reservation',
    });
    const before = item({ id: 'it-a', time: '17:00', durationMinutes: 90 });
    expect(detectFixedEventConflicts([before, reservation])).toEqual([]);
  });
});

describe('buildFixedEventAdjustment — the §13 fixture', () => {
  const adjustment = buildFixedEventAdjustment([...day6(), flight()], { ...boundaryContext, previousDate: DAY_5 });

  it('pulls what fits earlier and moves the rest to another day', () => {
    const moves = adjustment.changes.filter(change => change.type === 'move');
    const relocations = adjustment.changes.filter(change => change.type === 'moveToDay');

    // 白淺灘 and 太宗臺 fit if the day starts at 10:00; the 60-minute gap survives.
    expect(moves.map(change => [change.itemId, change.fromTime, change.toTime])).toEqual([
      ['it-a', '11:00', '10:00'],
      ['it-b', '14:00', '13:00'],
    ]);
    // P.ARK cannot fit before 15:00, so it is offered another day.
    expect(relocations.map(change => [change.itemId, change.toDate])).toEqual([['it-c', DAY_5]]);
  });

  it('never proposes moving the flight', () => {
    expect(adjustment.changes.some(change => change.itemId === 'it-flight')).toBe(false);
  });

  it('explains itself in the summary and reasons', () => {
    expect(adjustment.summary).toContain('3');
    expect(adjustment.changes.every(change => Boolean(change.reason))).toBe(true);
  });

  it('does not silently delete anything — every activity is accounted for', () => {
    const touched = new Set(adjustment.changes.map(change => change.itemId));
    expect(touched).toEqual(new Set(['it-a', 'it-b', 'it-c']));
  });

  it('leaves the itinerary untouched until it is applied', () => {
    const before = [...day6(), flight()];
    const snapshot = JSON.stringify(before);
    buildFixedEventAdjustment(before, { ...boundaryContext, previousDate: DAY_5 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('does not pull the day before the morning floor to squeeze everything in', () => {
    const startTimes = adjustment.changes
      .filter(change => change.toTime)
      .map(change => timeToMinutes(change.toTime!)!);
    startTimes.forEach(start => expect(start).toBeGreaterThanOrEqual(DAY_START_FLOOR_MINUTES));
  });
});

describe('buildFixedEventAdjustment — other shapes', () => {
  it('proposes nothing when the day already works', () => {
    const early = [
      item({ id: 'it-a', time: '09:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '12:00', durationMinutes: 120 }),
    ];
    const adjustment = buildFixedEventAdjustment([...early, flight()], boundaryContext);
    expect(adjustment.changes).toEqual([]);
  });

  it('keeps every activity when a small shift is enough', () => {
    const nearlyFits = [
      item({ id: 'it-a', time: '11:00', durationMinutes: 120 }),
      item({ id: 'it-b', time: '13:30', durationMinutes: 120 }),
    ];
    const adjustment = buildFixedEventAdjustment([...nearlyFits, flight()], boundaryContext);
    expect(adjustment.changes.every(change => change.type === 'move')).toBe(true);
    expect(adjustment.changes.map(change => change.toTime)).toEqual(['10:30', '13:00']);
  });

  it('reports a fixed-versus-fixed clash and proposes nothing', () => {
    const reservation = item({
      id: 'it-res', time: '16:30', durationMinutes: 90,
      scheduleFlexibility: 'fixed', fixedEventKind: 'reservation',
    });
    const adjustment = buildFixedEventAdjustment([reservation, flight()], boundaryContext);
    expect(adjustment.changes).toEqual([]);
    expect(adjustment.unresolved).toHaveLength(1);
    expect(adjustment.summary).toBe('目前有兩個固定行程發生衝突');
  });

  it('warns that travel time was estimated when no route was available', () => {
    const adjustment = buildFixedEventAdjustment([...day6(), flight()], { previousDate: DAY_5 });
    expect(adjustment.warnings).toContain('交通時間為估算值，請再次確認。');
  });

  it('does not warn about estimation when a route estimate was used', () => {
    const adjustment = buildFixedEventAdjustment([...day6(), flight()], { ...boundaryContext, previousDate: DAY_5 });
    expect(adjustment.warnings).toEqual([]);
  });
});

describe('applyFixedEventAdjustment', () => {
  const itinerary = () => [
    item({ id: 'it-day5', date: DAY_5, time: '10:00', durationMinutes: 60 }),
    ...day6(),
    flight(),
  ];

  it('writes the proposal by stable id and persists nothing else', () => {
    const source = itinerary();
    const adjustment = buildFixedEventAdjustment([...day6(), flight()], { ...boundaryContext, previousDate: DAY_5 });
    const result = applyFixedEventAdjustment(source, adjustment);

    expect(result.changed).toBe(true);
    const byId = new Map(result.items.map(entry => [entry.id, entry]));
    expect(byId.get('it-a')?.time).toBe('10:00');
    expect(byId.get('it-b')?.time).toBe('13:00');
    expect(byId.get('it-c')?.date).toBe(DAY_5);
    // Nothing was lost, and the other day's item is untouched.
    expect(result.items).toHaveLength(5);
    expect(byId.get('it-day5')).toEqual(source[0]);
  });

  it('refuses to move a fixed event even if a proposal names one', () => {
    const result = applyFixedEventAdjustment(itinerary(), {
      changes: [{ type: 'move', itemId: 'it-flight', fromTime: '18:00', toTime: '20:00', reason: 'hand-built' }],
      unresolved: [], warnings: [], summary: '',
    });
    expect(result.changed).toBe(false);
    expect(result.items.find(entry => entry.id === 'it-flight')?.time).toBe('18:00');
  });

  it('skips a change whose item no longer exists', () => {
    const result = applyFixedEventAdjustment(itinerary(), {
      changes: [{ type: 'move', itemId: 'gone', fromTime: '11:00', toTime: '10:00', reason: '' }],
      unresolved: [], warnings: [], summary: '',
    });
    expect(result.changed).toBe(false);
  });
});

describe('manual cascade respects fixed events', () => {
  it('stops the cascade at a fixed event instead of pushing it', () => {
    // §15: dragging 白淺灘 later must not shove the flight later too.
    const day = [...day6(), flight()];
    const result = rescheduleFromItem(day, 'it-a', timeToMinutes('12:00')!, { isFixed: isFixedItem });

    expect(result.blockedByFixed).toBe(true);
    const byId = new Map(result.items.map(entry => [entry.id, entry]));
    expect(byId.get('it-a')?.time).toBe('12:00');
    expect(byId.get('it-b')?.time).toBe('15:00');
    // The flight did not move.
    expect(byId.get('it-flight')?.time).toBe('18:00');
  });

  it('refuses to drag a fixed event at all', () => {
    const result = rescheduleFromItem([...day6(), flight()], 'it-flight', timeToMinutes('20:00')!, { isFixed: isFixedItem });
    expect(result.changed).toBe(false);
    expect(result.blockedByFixed).toBe(true);
  });

  it('cascades normally on a day with no fixed event', () => {
    const result = rescheduleFromItem(day6(), 'it-a', timeToMinutes('12:00')!, { isFixed: isFixedItem });
    expect(result.blockedByFixed).toBe(false);
    expect(result.items.map(entry => entry.time)).toEqual(['12:00', '15:00', '18:00']);
  });
});

describe('nextFixedBoundaryAfter', () => {
  it('reports the deadline a later fixed event imposes', () => {
    expect(nextFixedBoundaryAfter([...day6(), flight()], timeToMinutes('11:00')!, boundaryContext))
      .toBe(timeToMinutes('15:00'));
  });

  it('returns nothing when no fixed event follows', () => {
    expect(nextFixedBoundaryAfter(day6(), timeToMinutes('11:00')!)).toBeUndefined();
    expect(nextFixedBoundaryAfter([...day6(), flight()], timeToMinutes('19:00')!, boundaryContext)).toBeUndefined();
  });
});

describe('a flight anchor pair is one journey, not a conflict', () => {
  /**
   * Founder runtime: saving a 12:30 TPE flight generated 抵達機場 10:30 and
   * 航班起飛 12:30 from the same anchor, and the day immediately reported
   * 「目前有兩個固定行程發生衝突」 — the traveller against their own check-in.
   */
  const anchorId = 'anchor-tpe';
  const arriveAtAirport: ItineraryItem = {
    id: 'flight-arrival-anchor-tpe',
    date: '2026-10-02',
    time: '10:30',
    title: '抵達機場',
    location: 'Taiwan Taoyuan International Airport',
    notes: '',
    type: 'TRANSPORT',
    isCompleted: false,
    derivedFromFlightAnchorId: anchorId,
  };
  const departure: ItineraryItem = {
    id: 'flight-departure-anchor-tpe',
    date: '2026-10-02',
    time: '12:30',
    title: '航班起飛',
    location: 'Taiwan Taoyuan International Airport',
    notes: '',
    type: 'FLIGHT',
    isCompleted: false,
    derivedFromFlightAnchorId: anchorId,
  };

  it('reports no conflict for the two steps of one flight', () => {
    const conflicts = detectFixedEventConflicts([arriveAtAirport, departure]);
    expect(conflicts.filter(entry => entry.kind === 'fixed-vs-fixed')).toEqual([]);
  });

  it('does not subtract the check-in buffer twice', () => {
    // The arrival step's own time IS the deadline; it already embeds the buffer.
    expect(isAirportArrivalStep(arriveAtAirport)).toBe(true);
    expect(isAirportArrivalStep(departure)).toBe(false);
  });

  it('still reports a genuine clash between two unrelated fixed events', () => {
    const reservation: ItineraryItem = {
      id: 'it-dinner',
      date: '2026-10-02',
      time: '11:30',
      durationMinutes: 90,
      title: '餐廳予約',
      location: '餐廳',
      notes: '',
      type: 'FOOD',
      isCompleted: false,
      scheduleFlexibility: 'fixed',
      fixedEventKind: 'reservation',
    };
    const conflicts = detectFixedEventConflicts([reservation, departure]);
    expect(conflicts.some(entry => entry.kind === 'fixed-vs-fixed')).toBe(true);
  });

  it('a flexible item before the airport-arrival step is judged against 10:30', () => {
    const sightseeing: ItineraryItem = {
      id: 'it-morning',
      date: '2026-10-02',
      time: '09:00',
      durationMinutes: 120,
      title: '早晨行程',
      location: '台北',
      notes: '',
      type: 'ACTIVITY',
      isCompleted: false,
    };
    // Ends 11:00, past the 10:30 arrival step: a real conflict, reported once.
    const conflicts = detectFixedEventConflicts([sightseeing, arriveAtAirport, departure]);
    expect(conflicts.some(entry => entry.itemId === 'it-morning')).toBe(true);
  });
});

describe('describeUnresolvedConflicts', () => {
  const items = [
    { id: 'stay', title: '入住 廣安里凱星頓特酒店' },
    { id: 'flight', title: '航班起飛' },
    { id: 'dinner', title: '晚餐' },
  ];
  const conflict = (itemId: string, fixedItemId: string): FixedEventConflict =>
    ({ kind: 'fixed-vs-fixed', itemId, fixedItemId, boundaryMinutes: 0 });

  it('names the two items, which is the only thing the traveller needs', () => {
    // The banner said 「目前有兩個固定行程發生衝突」 as its heading and again as
    // its body. Twice, and neither time saying which two of six cards.
    expect(describeUnresolvedConflicts([conflict('stay', 'flight')], items))
      .toBe('「入住 廣安里凱星頓特酒店」和「航班起飛」的時間互相衝突。');
  });

  it('says each pair once, however many boundaries they collide on', () => {
    const twice = [conflict('stay', 'flight'), conflict('stay', 'flight')];
    expect(describeUnresolvedConflicts(twice, items))
      .toBe('「入住 廣安里凱星頓特酒店」和「航班起飛」的時間互相衝突。');
  });

  it('lists several distinct pairs', () => {
    const many = [conflict('stay', 'flight'), conflict('dinner', 'flight')];
    const described = describeUnresolvedConflicts(many, items);
    expect(described).toContain('入住 廣安里凱星頓特酒店');
    expect(described).toContain('晚餐');
  });

  it('says nothing rather than naming a card that is gone', () => {
    expect(describeUnresolvedConflicts([conflict('stay', 'deleted')], items)).toBe('');
    expect(describeUnresolvedConflicts([], items)).toBe('');
  });
});
