import { describe, expect, it } from 'vitest';
import { FlightAnchor } from '../types';
import { applyFlightToDraft, assignFlightsToLegs, normalizeParsedFlight } from './flightIntake';

const ticket = {
  direction: 'OUTBOUND',
  flightNumber: 'BR170',
  departureAirport: '桃園國際機場',
  departureAirportIata: 'TPE',
  departureDate: '2026-10-02',
  departureTime: '09:30',
  arrivalAirport: '金海國際機場',
  arrivalAirportIata: 'PUS',
  arrivalDate: '2026-10-02',
  arrivalTime: '13:05',
};

describe('normalizeParsedFlight', () => {
  it('keeps a complete boarding pass', () => {
    expect(normalizeParsedFlight(ticket)).toMatchObject({
      direction: 'OUTBOUND',
      flightNumber: 'BR170',
      departureAirportIata: 'TPE',
      departureDate: '2026-10-02',
      departureTime: '09:30',
      arrivalAirportIata: 'PUS',
    });
  });

  it('refuses a read with no departure date or time', () => {
    // An anchor exists to fix a moment; without one there is nothing to anchor.
    expect(normalizeParsedFlight({ ...ticket, departureDate: undefined })).toBeNull();
    expect(normalizeParsedFlight({ ...ticket, departureTime: undefined })).toBeNull();
    expect(normalizeParsedFlight({ ...ticket, departureTime: '25:99' })).toBeNull();
    expect(normalizeParsedFlight(null)).toBeNull();
  });

  it('normalizes a single-digit hour and a full-width colon', () => {
    expect(normalizeParsedFlight({ ...ticket, departureTime: '9:30' })?.departureTime).toBe('09:30');
    expect(normalizeParsedFlight({ ...ticket, departureTime: '09：30' })?.departureTime).toBe('09:30');
  });

  it('drops an IATA code that is not three letters', () => {
    expect(normalizeParsedFlight({ ...ticket, departureAirportIata: 'TAIPEI' })?.departureAirportIata).toBeUndefined();
    expect(normalizeParsedFlight({ ...ticket, departureAirportIata: 'tpe' })?.departureAirportIata).toBe('TPE');
  });

  it('accepts an overnight flight that lands the next day', () => {
    const flight = normalizeParsedFlight({ ...ticket, departureTime: '23:40', arrivalDate: '2026-10-03', arrivalTime: '03:15' });
    expect(flight?.arrivalDate).toBe('2026-10-03');
    expect(flight?.isUncertain).toBeUndefined();
  });

  it('flags a landing before take-off as a misread instead of storing it', () => {
    const flight = normalizeParsedFlight({ ...ticket, arrivalDate: '2026-10-01' });
    expect(flight?.arrivalDate).toBeUndefined();
    expect(flight?.isUncertain).toBe(true);
    // The departure, which is the part that matters, survives.
    expect(flight?.departureDate).toBe('2026-10-02');
  });

  it('flags a read with no usable departure airport', () => {
    const flight = normalizeParsedFlight({ ...ticket, departureAirport: undefined, departureAirportIata: undefined });
    expect(flight?.isUncertain).toBe(true);
  });

  it('ignores a direction the model invented', () => {
    expect(normalizeParsedFlight({ ...ticket, direction: 'SIDEWAYS' })?.direction).toBeUndefined();
  });
});

describe('applyFlightToDraft', () => {
  const draft: FlightAnchor[] = [
    { id: 'out', direction: 'OUTBOUND', departureDate: '', departureTime: '', departureAirport: '', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
    { id: 'ret', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '20:00', departureAirport: '金海國際機場', airportArrivalBufferMinutes: 120, source: 'MANUAL' },
  ];

  it('fills only the leg it was told to fill', () => {
    const next = applyFlightToDraft(draft, normalizeParsedFlight(ticket)!, 'OUTBOUND');
    expect(next[0]).toMatchObject({ departureDate: '2026-10-02', departureTime: '09:30', departureAirport: '桃園國際機場' });
    // The return leg is untouched.
    expect(next[1]).toEqual(draft[1]);
  });

  it('does not blank fields the screenshot could not supply', () => {
    // A partial read tops the draft up; it never wipes what was typed.
    const partial = normalizeParsedFlight({ departureDate: '2026-10-07', departureTime: '21:15' })!;
    const next = applyFlightToDraft(draft, partial, 'RETURN');
    expect(next[1]).toMatchObject({
      departureTime: '21:15',
      departureAirport: '金海國際機場',
    });
  });

  it('returns the same anchors when no leg matches', () => {
    const next = applyFlightToDraft([draft[0]], normalizeParsedFlight(ticket)!, 'RETURN');
    expect(next).toEqual([draft[0]]);
  });
});

describe('assignFlightsToLegs — a round-trip confirmation shows both', () => {
  const outbound = { ...ticket, direction: undefined };
  const ret = {
    flightNumber: 'BR169',
    departureAirport: '金海國際機場',
    departureAirportIata: 'PUS',
    departureDate: '2026-10-07',
    departureTime: '20:00',
    arrivalAirportIata: 'TPE',
  };

  it('fills both legs from one image', () => {
    const legs = assignFlightsToLegs({ flights: [outbound, ret] });
    expect(legs.OUTBOUND?.flightNumber).toBe('BR170');
    expect(legs.RETURN?.flightNumber).toBe('BR169');
  });

  it('is the bug this replaced: one flight used to be all that came back', () => {
    // The old endpoint normalised a single object and stopped, so the return
    // leg stayed empty and the upload looked half-broken.
    const legs = assignFlightsToLegs({ flights: [outbound, ret] });
    expect(Object.keys(legs).sort()).toEqual(['OUTBOUND', 'RETURN']);
  });

  it('uses chronology when the model does not say which leg is which', () => {
    // Given in reverse order, the earlier departure is still the outbound.
    const legs = assignFlightsToLegs({ flights: [ret, outbound] });
    expect(legs.OUTBOUND?.departureDate).toBe('2026-10-02');
    expect(legs.RETURN?.departureDate).toBe('2026-10-07');
  });

  it('trusts an explicit direction over chronology', () => {
    const legs = assignFlightsToLegs({
      flights: [{ ...ret, direction: 'OUTBOUND' }, { ...outbound, direction: 'RETURN' }],
    });
    expect(legs.OUTBOUND?.flightNumber).toBe('BR169');
    expect(legs.RETURN?.flightNumber).toBe('BR170');
  });

  it('treats a single flight as the outbound', () => {
    expect(assignFlightsToLegs({ flights: [outbound] })).toEqual({
      OUTBOUND: normalizeParsedFlight(outbound),
    });
  });

  it('still reads the old single-object shape', () => {
    expect(assignFlightsToLegs(outbound).OUTBOUND?.flightNumber).toBe('BR170');
    expect(assignFlightsToLegs([outbound, ret]).RETURN?.flightNumber).toBe('BR169');
  });

  it('keeps the first segment of a connection rather than the last', () => {
    // Three flights is a connecting journey, not an out-and-back, so the
    // chronological "second is the return" rule must not apply.
    const leg2 = { ...ret, flightNumber: 'KE123', departureDate: '2026-10-02', departureTime: '15:00' };
    const legs = assignFlightsToLegs({ flights: [outbound, leg2, ret] });
    expect(legs.OUTBOUND?.flightNumber).toBe('BR170');
  });

  it('returns nothing usable when no flight has a departure date and time', () => {
    expect(assignFlightsToLegs({ flights: [{ flightNumber: 'BR170' }] })).toEqual({});
    expect(assignFlightsToLegs(null)).toEqual({});
    expect(assignFlightsToLegs({ flights: [] })).toEqual({});
  });
});
