import { describe, expect, it } from 'vitest';
import { ItineraryItem } from '../types';
import { FlightArrivalPoint } from './flightDerivedItems';
import { StaySpan } from './stayIntake';
import {
  TRANSFER_ID_PREFIX,
  checkInTimeFromArrival,
  reconcileTransfers,
  transferIdFor,
  transferPairs,
} from './airportTransfer';

const arrival = (over: Partial<FlightArrivalPoint> = {}): FlightArrivalPoint => ({
  date: '2026-10-02', time: '13:05', airport: '金海國際機場', ...over,
});

const stay = (over: Partial<StaySpan> = {}): StaySpan => ({
  name: '海雲台格蘭飯店', checkInDate: '2026-10-02', checkOutDate: '2026-10-07',
  nights: ['2026-10-02'], itemId: 'stay-in', ...over,
});

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'x', time: '12:00', title: '午餐', location: '', notes: '', type: 'FOOD', ...over,
});

const noEstimates = () => undefined;
const keyOf = (pair: { arrival: FlightArrivalPoint; stay: StaySpan }) =>
  `${pair.arrival.airport}→${pair.stay.name}`;

describe('transferPairs', () => {
  it('matches a landing to a stay starting the same day', () => {
    expect(transferPairs([arrival()], [stay()])).toHaveLength(1);
  });

  it('ignores a landing with nowhere to go', () => {
    expect(transferPairs([arrival()], [stay({ checkInDate: '2026-10-05' })])).toEqual([]);
    expect(transferPairs([arrival()], [])).toEqual([]);
  });

  it('ignores a stay reached some other way', () => {
    // No flight that day: they arrived by train, or were already in the city.
    expect(transferPairs([], [stay()])).toEqual([]);
  });

  it('skips an arrival with no time, which is the state that hid this feature', () => {
    // The form had no arrival field at all, so every hand-entered flight
    // looked exactly like this and the transfer silently never appeared.
    expect(transferPairs([arrival({ time: '' })], [stay()])).toEqual([]);
  });
});

describe('reconcileTransfers', () => {
  const pairs = transferPairs([arrival()], [stay()]);

  it('adds the card, leaving the traveller’s own items alone', () => {
    const result = reconcileTransfers([item({ id: 'lunch' })], pairs, noEstimates, keyOf);
    expect(result.map(i => i.id)).toEqual(['lunch', transferIdFor('2026-10-02')]);
    expect(result[1].time).toBe('15:05');
  });

  it('replaces its own card instead of stacking another beside it', () => {
    // Editing a landing time re-derives; without a stable id every edit would
    // leave the previous card behind.
    const once = reconcileTransfers([], pairs, noEstimates, keyOf);
    const later = transferPairs([arrival({ time: '16:00' })], [stay()]);
    const twice = reconcileTransfers(once, later, noEstimates, keyOf);

    expect(twice.filter(i => i.id.startsWith(TRANSFER_ID_PREFIX))).toHaveLength(1);
    expect(twice[0].time).toBe('18:00');
  });

  it('removes its card when the flight or the stay goes', () => {
    const once = reconcileTransfers([item({ id: 'lunch' })], pairs, noEstimates, keyOf);
    expect(reconcileTransfers(once, [], noEstimates, keyOf).map(i => i.id)).toEqual(['lunch']);
  });

  it('carries the journey time once the estimate arrives', () => {
    const result = reconcileTransfers([], pairs, () => ({ travelSeconds: 78 * 60, mode: 'TRANSIT' }), keyOf);
    expect(result[0].notes).toContain('大眾運輸約 1 小時 18 分');
  });

  it('returns the same array when nothing moved, to stay out of the sync loop', () => {
    const once = reconcileTransfers([], pairs, noEstimates, keyOf);
    expect(reconcileTransfers(once, pairs, noEstimates, keyOf)).toBe(once);
  });
});

describe('checkInTimeFromArrival', () => {
  it('moves a check-in still on the uninformed default', () => {
    expect(checkInTimeFromArrival('15:00', '13:05', 78 * 60)).toBe('16:23');
    // No route yet: still after the ride in, not at the moment they walk out
    // of the terminal.
    expect(checkInTimeFromArrival('15:00', '08:30')).toBe('11:00');
  });

  it('leaves a time the traveller chose', () => {
    // These cards are deliberately movable. Re-deriving on every flight edit
    // would quietly undo a decision they made on purpose.
    expect(checkInTimeFromArrival('14:00', '13:05', 78 * 60)).toBeUndefined();
    expect(checkInTimeFromArrival('18:30', '08:30')).toBeUndefined();
  });

  it('says nothing when the result would be the time already shown', () => {
    // Clearing the airport at 14:30 plus the minimum ride lands back on 15:00.
    expect(checkInTimeFromArrival('15:00', '12:30')).toBeUndefined();
  });
});
