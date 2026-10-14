/**
 * 「其中一個地點還沒連結地圖，無法計算交通時間」 — still, on a trip whose ticket
 * names TPE and NRT.
 *
 * The coordinates were joined onto the path that *creates* a trip from a
 * boarding pass, and not onto the path that uploads one into the 航班資訊 card
 * of a trip already open. Two ways in, one of them wired.
 */
import { describe, expect, it } from 'vitest';
import { applyFlightToDraft, flightAnchorsFromParsed, locateAirports } from './flightIntake';
import { FlightAnchor } from '../types';

const draft = (over: Partial<FlightAnchor> = {}): FlightAnchor => ({
  id: 'leg-1',
  direction: 'OUTBOUND',
  departureDate: '',
  departureTime: '',
  departureAirport: '',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
  ...over,
} as FlightAnchor);

const parsed = {
  departureDate: '2026-10-20',
  departureTime: '06:35',
  departureAirport: 'Taipei',
  departureAirportIata: 'TPE',
  arrivalAirport: 'Tokyo',
  arrivalAirportIata: 'NRT',
  arrivalTime: '11:00',
};

describe('uploading a ticket into a trip already open', () => {
  it('puts both airports on the map', () => {
    const [anchor] = applyFlightToDraft([draft()], parsed, 'OUTBOUND');

    expect(anchor.departureAirportLatitude).toBeCloseTo(25.0777, 4);
    expect(anchor.departureAirportLongitude).toBeCloseTo(121.2328, 4);
    expect(anchor.arrivalAirportLatitude).toBeCloseTo(35.772, 4);
    expect(anchor.arrivalAirportLongitude).toBeCloseTo(140.3929, 4);
  });

  /** The same join the trip-creating path already made. */
  it('agrees with the path that creates a trip from the ticket', () => {
    const [created] = flightAnchorsFromParsed([{ ...parsed, direction: 'OUTBOUND' }], () => 'x');
    const [applied] = applyFlightToDraft([draft()], parsed, 'OUTBOUND');

    expect(applied.departureAirportLatitude).toBe(created.departureAirportLatitude);
    expect(applied.arrivalAirportLongitude).toBe(created.arrivalAirportLongitude);
  });
});

describe('locateAirports', () => {
  /*
    A changed flight is the reason this clears rather than leaves: 「有可能會有
    傳錯或改航班的狀況」, and the previous airport's position outliving the
    airport is a wrong location that does not look wrong.
  */
  it('clears coordinates the new airport cannot justify', () => {
    const located = locateAirports(draft({
      departureAirportIata: 'ZZZ',
      departureAirportLatitude: 25.0777,
      departureAirportLongitude: 121.2328,
    }));

    expect(located.departureAirportLatitude).toBeUndefined();
    expect(located.departureAirportLongitude).toBeUndefined();
  });

  /** A hand-picked airport has coordinates that did not come from a code. */
  it('leaves a side with no IATA code alone', () => {
    const located = locateAirports(draft({
      departureAirport: '某個小機場',
      departureAirportLatitude: 1.5,
      departureAirportLongitude: 2.5,
    }));

    expect(located.departureAirportLatitude).toBe(1.5);
    expect(located.departureAirportLongitude).toBe(2.5);
  });

  it('does not touch the other leg of the draft', () => {
    const legs = [draft(), draft({ id: 'leg-2', direction: 'RETURN' })];

    const applied = applyFlightToDraft(legs, parsed, 'OUTBOUND');

    expect(applied[1]).toBe(legs[1]);
  });
});
