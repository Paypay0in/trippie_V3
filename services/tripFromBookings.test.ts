import { describe, expect, it } from 'vitest';
import { ParsedFlight } from './flightIntake';
import { ParsedStay } from './stayIntake';
import { readoutSummary, tripFromBookings, worthKeeping } from './tripFromBookings';

/**
 * 「這個是要提示用戶上傳機票旅館等住宿」.
 *
 * Most of these are about refusing to guess. A trip that arrives pre-filled
 * with plausible wrong dates is worse than an empty form, because the empty
 * form gets read.
 */

const outbound: ParsedFlight = {
  direction: 'OUTBOUND',
  departureAirportIata: 'TPE',
  arrivalAirportIata: 'PUS',
  departureDate: '2026-10-02',
  departureTime: '09:15',
};

const back: ParsedFlight = {
  direction: 'RETURN',
  departureAirportIata: 'PUS',
  arrivalAirportIata: 'TPE',
  departureDate: '2026-10-07',
  arrivalDate: '2026-10-07',
};

const stay: ParsedStay = {
  hotelName: '釜山樂天飯店',
  checkInDate: '2026-10-02',
  checkOutDate: '2026-10-07',
};

describe('deriving a trip from bookings', () => {
  it('reads the destination off the outbound arrival airport', () => {
    const trip = tripFromBookings({ flights: [outbound, back], stays: [] });
    expect(trip.destination).toBe('Busan');
    expect(trip.country).toBe('South Korea');
  });

  it('spans from leaving home to getting back', () => {
    const trip = tripFromBookings({ flights: [outbound, back], stays: [] });
    expect(trip.startDate).toBe('2026-10-02');
    expect(trip.endDate).toBe('2026-10-07');
  });

  /**
   * A 23:50 departure landing after midnight is a trip one day longer. Ending
   * it on the departure date cuts off the day the traveller is still
   * travelling — the day they most need the ledger.
   */
  it('ends on the day the return flight lands, not the day it leaves', () => {
    const trip = tripFromBookings({
      flights: [outbound, { ...back, departureDate: '2026-10-07', arrivalDate: '2026-10-08' }],
      stays: [],
    });
    expect(trip.endDate).toBe('2026-10-08');
  });

  /** One day short is visible on a screen they confirm; an invented day is not. */
  it('falls back to the return departure when no arrival date was read', () => {
    const trip = tripFromBookings({
      flights: [outbound, { ...back, arrivalDate: undefined }],
      stays: [],
    });
    expect(trip.endDate).toBe('2026-10-07');
  });

  /**
   * 「Gimhae International Airport」 is not a destination anybody would type,
   * and an unknown code must not become one. Blank asks the question the form
   * is already asking.
   */
  it('leaves the destination empty for an airport it does not know', () => {
    const trip = tripFromBookings({
      flights: [{ ...outbound, arrivalAirportIata: 'ZZZ' }],
      stays: [],
    });
    expect(trip.destination).toBeUndefined();
    expect(trip.startDate).toBe('2026-10-02');
  });

  it('works from a hotel booking alone', () => {
    const trip = tripFromBookings({ flights: [], stays: [stay] });
    expect(trip.startDate).toBe('2026-10-02');
    expect(trip.endDate).toBe('2026-10-07');
    expect(trip.destination).toBeUndefined();
  });

  it('starts on the earliest thing that happens, flight or check-in', () => {
    const trip = tripFromBookings({
      flights: [outbound],
      stays: [{ ...stay, checkInDate: '2026-10-01' }],
    });
    expect(trip.startDate).toBe('2026-10-01');
  });

  it('ends on the latest, so a hotel past the flight still counts', () => {
    const trip = tripFromBookings({
      flights: [outbound, back],
      stays: [{ ...stay, checkOutDate: '2026-10-09' }],
    });
    expect(trip.endDate).toBe('2026-10-09');
  });

  /** A one-way flight has no end, and saying so beats inventing one. */
  it('leaves the end open for a one-way flight', () => {
    const trip = tripFromBookings({ flights: [outbound], stays: [] });
    expect(trip.startDate).toBe('2026-10-02');
    expect(trip.endDate).toBeUndefined();
  });

  /** A trip that ends before it starts was misread, not short. */
  it('drops an end date that falls before the start', () => {
    const trip = tripFromBookings({
      flights: [outbound, { ...back, arrivalDate: '2026-09-01' }],
      stays: [],
    });
    expect(trip.endDate).toBeUndefined();
  });

  it('treats a flight with no stated direction as the way out', () => {
    const trip = tripFromBookings({
      flights: [{ ...outbound, direction: undefined }],
      stays: [],
    });
    expect(trip.destination).toBe('Busan');
    expect(trip.startDate).toBe('2026-10-02');
  });
});

describe('whether the read was worth anything', () => {
  it('keeps a readout that found dates', () => {
    expect(worthKeeping({ startDate: '2026-10-02' })).toBe(true);
  });

  it('keeps a readout that found only a destination', () => {
    expect(worthKeeping({ destination: 'Busan' })).toBe(true);
  });

  /** An empty, undated trip is the thing he has already deleted three of. */
  it('refuses a readout that found nothing', () => {
    expect(worthKeeping({})).toBe(false);
  });
});

describe('saying what was read, before anything is saved', () => {
  it('counts both kinds', () => {
    expect(readoutSummary({ flights: [outbound, back], stays: [stay] }))
      .toBe('讀到 2 張機票・1 筆住宿');
  });

  it('says so when nothing came back', () => {
    expect(readoutSummary({ flights: [], stays: [] })).toBe('沒有讀到可用的資料');
  });
});
