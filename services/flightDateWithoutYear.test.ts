/**
 * 「這張航班時間如此明確 為何一直說讀不出來」.
 *
 * The exact payload the deployed parser returned for the Founder's Tigerair
 * confirmation — 「10 月 20 日（二）· 6:35」 — read correctly in every field and
 * rejected wholesale, because the date arrived as "10-20".
 *
 * That shape was our own doing: the prompt forbids falling back on a year
 * from training data (the repair for 「我傳機票資訊 結果日期不正確」), so the model
 * stopped printing one, and nothing downstream accepted a date without a year.
 */
import { describe, expect, it } from 'vitest';
import { assignFlightsToLegs, normalizeParsedFlight } from '../services/flightIntake';

/** As returned by gemini-3.1-flash-lite for that screenshot, verbatim. */
const asRead = {
  flights: [
    {
      departureDate: '10-20', departureTime: '06:35', departureWeekday: '二',
      departureAirport: 'Taipei', departureAirportIata: 'TPE',
      arrivalAirport: 'Tokyo', arrivalAirportIata: 'NRT',
      arrivalDate: '10-20', arrivalTime: '11:00',
      direction: 'OUTBOUND', flightNumber: 'IT200', isUncertain: false,
    },
    {
      departureDate: '10-24', departureTime: '21:15', departureWeekday: '六',
      departureAirport: 'Tokyo', departureAirportIata: 'NRT',
      arrivalAirport: 'Taipei', arrivalAirportIata: 'TPE',
      arrivalDate: '10-24', arrivalTime: '23:55',
      direction: 'RETURN', flightNumber: 'TR875', isUncertain: false,
    },
  ],
};

describe('a ticket that prints no year', () => {
  it('is read instead of refused', () => {
    const legs = assignFlightsToLegs(asRead);

    expect(legs.OUTBOUND?.flightNumber).toBe('IT200');
    expect(legs.RETURN?.flightNumber).toBe('TR875');
  });

  /** The weekday is what names the year — 10/20 is a Tuesday in 2026. */
  it('takes the year from the printed weekday', () => {
    const legs = assignFlightsToLegs(asRead);

    expect(legs.OUTBOUND?.departureDate).toBe('2026-10-20');
    expect(legs.RETURN?.departureDate).toBe('2026-10-24');
  });

  /** A year nobody printed is a year worth checking. */
  it('flags the year it had to work out', () => {
    expect(assignFlightsToLegs(asRead).OUTBOUND?.isUncertain).toBe(true);
  });

  it('gives the arrival the same year', () => {
    expect(assignFlightsToLegs(asRead).OUTBOUND?.arrivalDate).toBe('2026-10-20');
  });

  /** A flight that lands on an earlier day than it left crossed New Year. */
  it('rolls a yearless arrival over the new year', () => {
    const flight = normalizeParsedFlight({
      departureDate: '12-31', departureTime: '22:00', departureWeekday: '四',
      departureAirport: 'TPE', arrivalDate: '01-01', arrivalTime: '02:00',
    });

    expect(flight?.departureDate).toBe('2026-12-31');
    expect(flight?.arrivalDate).toBe('2027-01-01');
  });

  /** A full date still wins over anything inferred. */
  it('leaves a printed year alone', () => {
    const flight = normalizeParsedFlight({
      departureDate: '2027-10-20', departureTime: '06:35', departureAirport: 'TPE',
    });

    expect(flight?.departureDate).toBe('2027-10-20');
    expect(flight?.isUncertain).toBeUndefined();
  });

  /** Not a date at all is still not a date. */
  it('still refuses what it cannot read', () => {
    expect(normalizeParsedFlight({ departureDate: '下週二', departureTime: '06:35' })).toBeNull();
  });
});
