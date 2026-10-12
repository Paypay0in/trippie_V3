import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { flightAnchorsFromParsed } from '../services/flightIntake';
import { flightArrivals } from '../services/flightDerivedItems';
import { stayToItineraryItems } from '../services/stayIntake';
import { tripFromBookings } from '../services/tripFromBookings';

/**
 * 「我剛從這邊上傳機票 有成功建立旅冊 但是沒有將航班資訊放入行程表」.
 *
 * The import sheet has always handed its readout over as the second argument
 * of `onCreate`, and the screen took only the first. So the trip was derived
 * from the flights — its dates, its destination — and then the flights
 * themselves were dropped on the floor. A traveller watched a trip appear out
 * of their ticket and arrive with no ticket in it.
 */

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

const outbound = {
  direction: 'OUTBOUND' as const,
  departureAirport: 'TPE · Taiwan Taoyuan International Airport',
  departureAirportIata: 'TPE',
  departureDate: '2026-10-20',
  departureTime: '06:35',
  arrivalAirport: 'NRT · Narita International Airport',
  arrivalAirportIata: 'NRT',
  arrivalDate: '2026-10-20',
  arrivalTime: '11:00',
};

const back = {
  direction: 'RETURN' as const,
  departureAirport: 'NRT · Narita International Airport',
  departureDate: '2026-10-24',
  departureTime: '21:15',
  arrivalAirport: 'TPE · Taiwan Taoyuan International Airport',
  arrivalDate: '2026-10-24',
  arrivalTime: '23:55',
};

describe('what the import read', () => {
  /**
   * The same two functions the upload cards use. The conversion is covered
   * where each lives; what matters here is that the trip and the flights come
   * out of one readout and agree with each other.
   */
  it('produces a trip and the anchors that trip was derived from', () => {
    const readout = { flights: [outbound, back], stays: [] };

    const trip = tripFromBookings(readout);
    const anchors = flightAnchorsFromParsed(readout.flights, () => 'id');

    expect(trip.startDate).toBe('2026-10-20');
    expect(anchors).toHaveLength(2);
    // The dates the trip took are the dates the anchors carry: one readout,
    // so they cannot disagree.
    expect(anchors[0]?.departureDate).toBe(trip.startDate);
    expect(anchors.map(item => item.direction)).toEqual(['OUTBOUND', 'RETURN']);
  });

  /** A room read at the same time lands on the itinerary, timed off the landing. */
  it('times an imported stay from the imported arrival', () => {
    const anchors = flightAnchorsFromParsed([outbound], () => 'id');
    const items = stayToItineraryItems(
      { hotelName: '成田東武飯店', checkInDate: '2026-10-20', checkOutDate: '2026-10-24' } as never,
      () => 'stay-id',
      flightArrivals(anchors),
    );

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.date).toBe('2026-10-20');
  });
});

/**
 * The wiring, read off the screen that holds it.
 *
 * Two failures were possible and both are silent: taking only the first
 * argument of `onCreate`, and setting the bookings after `hydrateDraft`
 * rather than on the draft — hydrating resets everything that effect writes,
 * so anything set afterwards is wiped by it. That is the same ordering that
 * swallowed `planBrief`.
 */
describe('and where it has to be put', () => {
  it('takes the readout the sheet already hands over', () => {
    expect(APP).toContain('onCreate={(trip, readout) => {');
    expect(APP).toContain('setImportedBookings(readout);');
  });

  it('puts the bookings on the draft, not after hydrating', () => {
    const create = APP.indexOf('...importedBookingsForDraft(),');
    const hydrate = APP.indexOf('hydrateDraft(newDraft);');

    expect(create).toBeGreaterThan(-1);
    expect(hydrate).toBeGreaterThan(-1);
    expect(create).toBeLessThan(hydrate);
  });

  /**
   * Cleared once spent. Neither of these was, and both are read only while a
   * trip is being created — so the next trip created on this device would
   * have opened pre-filled with the last import's dates, and now its flights
   * too. That is 「我建立沖繩行程 裏面有這個機票資訊」, one state away.
   */
  it('clears both once the trip exists', () => {
    const after = APP.slice(APP.indexOf('hydrateDraft(newDraft);'));
    expect(after).toContain('setImportedTrip(null);');
    expect(after).toContain('setImportedBookings(null);');
  });
});
