import { describe, expect, it } from 'vitest';
import { FlightAnchor, ItineraryItem } from '../types';
import {
  derivedItemIdsFor,
  itemsFromFlightAnchor,
  reconcileFlightDerivedItems,
} from './flightDerivedItems';

const anchor = (over: Partial<FlightAnchor> = {}): FlightAnchor => ({
  id: 'anchor-out',
  direction: 'OUTBOUND',
  departureDate: '2026-10-02',
  departureTime: '09:30',
  departureAirport: '桃園國際機場',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
  ...over,
});

const plain = (id: string): ItineraryItem => ({
  id,
  time: '12:00',
  title: '午餐',
  location: '札嘎其市場',
  notes: '',
  type: 'FOOD',
  date: '2026-10-03',
});

describe('itemsFromFlightAnchor', () => {
  it('derives an airport arrival ahead of the departure', () => {
    const items = itemsFromFlightAnchor(anchor());
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: '抵達機場', time: '07:30', date: '2026-10-02' });
    expect(items[1]).toMatchObject({ title: '航班起飛', time: '09:30' });
  });

  it('clamps the airport arrival at midnight rather than into the day before', () => {
    expect(itemsFromFlightAnchor(anchor({ departureTime: '00:45' }))[0].time).toBe('00:00');
  });

  it('derives nothing from an anchor missing the essentials', () => {
    expect(itemsFromFlightAnchor(anchor({ departureTime: '' }))).toEqual([]);
    expect(itemsFromFlightAnchor(anchor({ departureAirport: '' }))).toEqual([]);
  });

  it('keeps ids stable, so re-deriving does not duplicate the pair', () => {
    const first = itemsFromFlightAnchor(anchor()).map(item => item.id);
    const second = itemsFromFlightAnchor(anchor()).map(item => item.id);
    expect(first).toEqual(second);
    expect(first).toEqual(derivedItemIdsFor('anchor-out'));
  });
});

describe("a companion's device must not erase the other traveller's flights", () => {
  // The exact Busan scenario: North enters flights, they sync as itinerary
  // items, and his friend opens the app with no anchors of her own.
  const synced = itemsFromFlightAnchor(anchor());

  it('keeps flight items derived from an anchor this device never held', () => {
    const result = reconcileFlightDerivedItems(
      [...synced, plain('lunch')],
      [],            // she has no anchors: they do not sync
      new Set(),     // and has never held any
    );
    expect(result.map(item => item.id).sort()).toEqual([...synced.map(i => i.id), 'lunch'].sort());
  });

  it('is what the shipped filter got wrong', () => {
    // The old reconciliation, verbatim.
    const shipped = [...synced, plain('lunch')].filter(item => !item.derivedFromFlightAnchorId);
    expect(shipped.map(item => item.id)).toEqual(['lunch']);
    // Both flight items gone, and the sync push would have pruned them for
    // the owner too. The replacement keeps them.
    expect(reconcileFlightDerivedItems([...synced, plain('lunch')], [], new Set())).toHaveLength(3);
  });
});

describe('on the device that owns the anchors', () => {
  it('removes the items of an anchor deleted here', () => {
    const synced = itemsFromFlightAnchor(anchor());
    const result = reconcileFlightDerivedItems(
      [...synced, plain('lunch')],
      [],                          // anchor deleted
      new Set(['anchor-out']),     // but this device held it
    );
    expect(result.map(item => item.id)).toEqual(['lunch']);
  });

  it('rebuilds an edited anchor without leaving the old pair behind', () => {
    const before = itemsFromFlightAnchor(anchor());
    const result = reconcileFlightDerivedItems(
      before,
      [anchor({ departureTime: '18:00' })],
      new Set(['anchor-out']),
    );
    expect(result).toHaveLength(2);
    expect(result[0].time).toBe('16:00');
    expect(result[1].time).toBe('18:00');
  });

  it('handles two anchors independently', () => {
    const outbound = anchor();
    const ret = anchor({ id: 'anchor-ret', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '20:00', departureAirport: '金海國際機場' });
    const result = reconcileFlightDerivedItems([], [outbound, ret], new Set());
    expect(result).toHaveLength(4);
    expect(result.filter(i => i.derivedFromFlightAnchorId === 'anchor-ret')).toHaveLength(2);
  });

  it('leaves items that were never derived from a flight alone', () => {
    const result = reconcileFlightDerivedItems([plain('lunch'), plain('museum')], [], new Set(['anchor-out']));
    expect(result.map(item => item.id)).toEqual(['lunch', 'museum']);
  });
});

describe('stability', () => {
  it('returns the same reference when nothing changed, to stay out of the sync loop', () => {
    const current = itemsFromFlightAnchor(anchor());
    const result = reconcileFlightDerivedItems(current, [anchor()], new Set(['anchor-out']));
    // Rebuilt items are new objects, so identity differs and a new array is
    // returned; what matters is the content is identical.
    expect(result.map(i => ({ ...i }))).toEqual(current.map(i => ({ ...i })));

    const untouched = [plain('lunch')];
    expect(reconcileFlightDerivedItems(untouched, [], new Set())).toBe(untouched);
  });

  it('keeps a completed flight item ticked when the anchor is re-derived', () => {
    const [arrival, departure] = itemsFromFlightAnchor(anchor());
    const result = reconcileFlightDerivedItems(
      [{ ...arrival, isCompleted: true }, departure],
      [anchor()],
      new Set(['anchor-out']),
    );
    expect(result.find(item => item.id === arrival.id)?.isCompleted).toBe(true);
    expect(result.find(item => item.id === departure.id)?.isCompleted).toBe(false);
  });
});
