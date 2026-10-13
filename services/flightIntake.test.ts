import { describe, expect, it } from 'vitest';
import { FlightAnchor } from '../types';
import { applyFlightToDraft, assignFlightsToLegs, legsToApply, normalizeParsedFlight, yearFromWeekday, flightAnchorsFromParsed } from './flightIntake';

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

describe('legsToApply', () => {
  const out = normalizeParsedFlight(ticket)!;
  const back = normalizeParsedFlight({
    flightNumber: 'BR169', departureAirportIata: 'PUS',
    departureDate: '2026-10-07', departureTime: '20:00',
  })!;

  it('returns both legs for a round trip, which is what the caller reports', () => {
    expect(legsToApply({ OUTBOUND: out, RETURN: back }, 'ROUND_TRIP')).toEqual([
      ['OUTBOUND', out],
      ['RETURN', back],
    ]);
  });

  it('returns an empty list only when there is genuinely nothing to apply', () => {
    // The shipped bug produced an empty list on every success, because the
    // list was built inside a setState updater and read before React ran it.
    // Deciding here is what makes the answer independent of render timing.
    expect(legsToApply({}, 'ROUND_TRIP')).toEqual([]);
    expect(legsToApply({ OUTBOUND: out }, 'ROUND_TRIP')).toHaveLength(1);
  });

  it('skips a leg the image did not supply rather than filling it with nothing', () => {
    expect(legsToApply({ RETURN: back }, 'ROUND_TRIP')).toEqual([['RETURN', back]]);
  });

  it('puts a lone flight on the outbound in one-way mode, whichever leg it read as', () => {
    expect(legsToApply({ OUTBOUND: out, RETURN: back }, 'ONE_WAY')).toEqual([['OUTBOUND', out]]);
    // A one-way trip has no return field, so a return read still lands somewhere.
    expect(legsToApply({ RETURN: back }, 'ONE_WAY')).toEqual([['OUTBOUND', back]]);
    expect(legsToApply({}, 'ONE_WAY')).toEqual([]);
  });
});

/**
 * 「我傳機票資訊 結果日期不正確」.
 *
 * The confirmation printed 「10 月 20 日（二）」 and 「10 月 24 日（六）」 and no
 * year anywhere. The read came back 2023-10-20 — a Friday — and a trip was
 * created three years in the past.
 *
 * The weekday was on the page the whole time, and 10/20 lands on a Tuesday
 * once every five or six years, so it names the year outright:
 *
 *   2023  10/20 Fri      2026  10/20 Tue   10/24 Sat   ← the only match
 */
describe('the year a ticket does not print', () => {
  it('fixes the year from the weekday beside the date', () => {
    expect(yearFromWeekday('2023-10-20', '二')).toBe('2026-10-20');
    expect(yearFromWeekday('2023-10-24', '六')).toBe('2026-10-24');
  });

  it('reads an English weekday too', () => {
    expect(yearFromWeekday('2023-10-20', 'Tue')).toBe('2026-10-20');
    expect(yearFromWeekday('2023-10-20', 'Tuesday')).toBe('2026-10-20');
  });

  it('leaves a date the weekday already agrees with', () => {
    expect(yearFromWeekday('2026-10-20', '二')).toBe('2026-10-20');
  });

  /** No evidence, no repair: the read date came off the page, a guess would not. */
  it('changes nothing without a weekday it can read', () => {
    expect(yearFromWeekday('2023-10-20', undefined)).toBe('2023-10-20');
    expect(yearFromWeekday('2023-10-20', '')).toBe('2023-10-20');
    expect(yearFromWeekday('2023-10-20', '週末')).toBe('2023-10-20');
  });

  /**
   * Nearest wins, and only within five years. Beyond that a disagreeing
   * weekday is more likely a misread character than a date six years out.
   */
  it('takes the closest year that fits', () => {
    // 2027-10-20 is a Wednesday; 2021 is one too, and is further away.
    expect(yearFromWeekday('2026-10-20', '三')).toBe('2027-10-20');
  });

  it('repairs the whole flight, and says it had to', () => {
    const flight = normalizeParsedFlight({
      departureDate: '2023-10-20',
      departureWeekday: '二',
      departureTime: '06:35',
      departureAirport: 'Taipei (TPE)',
      arrivalAirport: 'Tokyo (NRT)',
      arrivalDate: '2023-10-20',
      arrivalTime: '11:00',
    });

    expect(flight?.departureDate).toBe('2026-10-20');
    // Both ends move together: the arrival follows the departure's shift
    // rather than being looked up on its own, so an overnight flight is not
    // dragged into a different year from its own take-off.
    expect(flight?.arrivalDate).toBe('2026-10-20');
    // A year nobody printed and we worked out is worth one look.
    expect(flight?.isUncertain).toBe(true);
  });

  it('says nothing about a flight whose year was printed correctly', () => {
    const flight = normalizeParsedFlight({
      departureDate: '2026-10-20',
      departureWeekday: '二',
      departureTime: '06:35',
      departureAirport: 'Taipei (TPE)',
    });

    expect(flight?.departureDate).toBe('2026-10-20');
    expect(flight?.isUncertain).toBeUndefined();
  });
});

/**
 * 「這個機票有明確的起降機場 行程表應該要做到自動帶入地點」.
 *
 * The ticket prints TPE and NRT. The directory has held both with
 * coordinates since it was written, and the anchor has had the fields all
 * along — nothing joined them, so a flight read from a screenshot arrived
 * unmapped and every leg touching it could not be timed.
 */
describe('the airports a ticket names', () => {
  const read = (over: Record<string, unknown> = {}) => flightAnchorsFromParsed([{
    direction: 'OUTBOUND',
    departureAirport: 'Taipei (TPE)',
    departureAirportIata: 'TPE',
    departureDate: '2026-10-20',
    departureTime: '06:35',
    arrivalAirport: 'Tokyo (NRT)',
    arrivalAirportIata: 'NRT',
    ...over,
  }] as never, () => 'id')[0];

  it('places both ends from the curated table', () => {
    const anchor = read();

    expect(anchor?.departureAirportLatitude).toBe(25.0777);
    expect(anchor?.arrivalAirportLatitude).toBe(35.772);
  });

  /**
   * An airport this app has not been told about gets no coordinates rather
   * than a guessed pair — the same rule the destination lookup follows, and
   * the reason the table is hand-maintained.
   */
  it('places nothing it does not know', () => {
    const anchor = read({ arrivalAirportIata: 'ISG', arrivalAirport: 'Ishigaki' });

    expect(anchor?.departureAirportLatitude).toBe(25.0777);
    expect(anchor?.arrivalAirportLatitude).toBeUndefined();
  });
});
