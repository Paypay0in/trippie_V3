import { describe, expect, it } from 'vitest';
import { FlightAnchor } from '../types';
import { anchorsBrief, missingAnchors } from '../services/planningAnchors';

/**
 * 「國內旅遊沒有這個」 — said about 上傳機票 on a 新莊 trip.
 *
 * A domestic traveller has no boarding pass to upload, and a request that
 * cannot be satisfied does more than waste a tap: it sits next to the one
 * that can (住宿) and makes that one look optional too. The same reasoning
 * already removed entry rules and the socket card from domestic trips.
 *
 * The line this must not cross is the one that makes it tempting to go
 * further: 松山→澎湖 and 松山→金門 ARE domestic flights. So only the ASKING
 * stops. A flight anchor already on the trip is still read, still written
 * into the prompt, and still decides how much of day one is left — because
 * `anchorsBrief` reports what exists and has never asked for anything.
 *
 * And an unclassified trip is still asked. `undefined` is not domestic, here
 * for the same reason as in the entry-rules block: a guess that hides
 * something is discovered at the airport.
 */

const flight = (): FlightAnchor => ({
  id: 'f1',
  direction: 'OUTBOUND',
  departureDate: '2026-05-10',
  arrivalDate: '2026-05-10',
  arrivalTime: '18:40',
  arrivalAirport: 'MFK',
} as never);

describe('a domestic trip', () => {
  it('is never asked for a boarding pass', () => {
    expect(missingAnchors({ tripScope: 'domestic' })).toEqual(['stays']);
  });

  it('is still asked where they sleep', () => {
    expect(missingAnchors({ tripScope: 'domestic' })).toContain('stays');
  });

  /*
    The half that is easy to delete by accident. Dropping the question must
    not drop the fact: 澎湖 and 金門 are reached by plane, and that arrival
    time is what tells the planner the first day is half gone.
  */
  it('still reads a domestic flight it already has', () => {
    expect(missingAnchors({ flightAnchors: [flight()], tripScope: 'domestic' })).toEqual(['stays']);
    expect(anchorsBrief({ flightAnchors: [flight()], tripScope: 'domestic' })).toContain('18:40');
  });
});

describe('a trip nobody has classified', () => {
  /*
    Not domestic. The same answer the entry-rules block gives an unresolved
    trip, and for the same reason.
  */
  it('is still asked for both', () => {
    expect(missingAnchors({})).toEqual(['flights', 'stays']);
    expect(missingAnchors({ tripScope: 'international' })).toEqual(['flights', 'stays']);
  });
});
