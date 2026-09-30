import { describe, expect, it } from 'vitest';
import { FlightAnchor } from '../types';
import {
  airportOf,
  applyAirport,
  buildFlightAnchorDraft,
  destinationAirportCandidates,
  validateFlightAnchors,
  parseTimeInput,
  formatTimeInput,
  flightTimesLabel,
} from './flightAnchorSetup';
import { airportCandidatesForCity, findAirportByIata, searchAirports } from './airportDirectory';
import { dedupeFlightAnchors } from './tripPersistence';

const anchor = (overrides: Partial<FlightAnchor> & Pick<FlightAnchor, 'id' | 'direction'>): FlightAnchor => ({
  departureDate: '',
  departureTime: '',
  departureAirport: '',
  airportArrivalBufferMinutes: 120,
  source: 'MANUAL',
  ...overrides,
});

const TRIP = { destination: 'Busan', startDate: '2026-09-14', endDate: '2026-10-07' };

describe('airport directory', () => {
  it('finds Toronto airports by city name', () => {
    const codes = searchAirports('Toronto').map(item => item.iataCode);
    expect(codes).toContain('YYZ');
    expect(codes).toContain('YTZ');
  });

  it('finds Gimhae for Busan', () => {
    expect(searchAirports('Busan').map(item => item.iataCode)).toEqual(['PUS']);
  });

  it('finds both Taipei airports', () => {
    const codes = searchAirports('Taipei').map(item => item.iataCode);
    expect(codes).toContain('TPE');
    expect(codes).toContain('TSA');
  });

  it('matches an IATA code exactly and ranks it first', () => {
    expect(searchAirports('pus')[0].iataCode).toBe('PUS');
  });

  it('resolves a Chinese destination name', () => {
    expect(searchAirports('釜山').map(item => item.iataCode)).toEqual(['PUS']);
  });

  it('returns undefined for an unknown code instead of inventing one', () => {
    expect(findAirportByIata('ZZZ')).toBeUndefined();
  });

  it('offers a primary only when the city has one airport', () => {
    expect(airportCandidatesForCity('Busan').primary?.iataCode).toBe('PUS');
    expect(airportCandidatesForCity('Taipei').primary).toBeUndefined();
    expect(airportCandidatesForCity('Taipei').candidates).toHaveLength(2);
  });
});

describe('default flight structure', () => {
  it('builds exactly one outbound and one return', () => {
    const draft = buildFlightAnchorDraft([], TRIP);
    expect(draft.map(item => item.direction)).toEqual(['OUTBOUND', 'RETURN']);
  });

  it('builds only an outbound for a one-way trip', () => {
    const draft = buildFlightAnchorDraft([], TRIP, 'ONE_WAY');
    expect(draft.map(item => item.direction)).toEqual(['OUTBOUND']);
  });

  it('never produces a duplicate return from duplicated legacy state', () => {
    const legacy = [
      anchor({ id: 'r1', direction: 'RETURN' }),
      anchor({ id: 'r2', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '17:30', departureAirport: 'Gimhae International Airport' }),
      anchor({ id: 'o1', direction: 'OUTBOUND' }),
    ];
    const draft = buildFlightAnchorDraft(legacy, TRIP);
    expect(draft.filter(item => item.direction === 'RETURN')).toHaveLength(1);
    expect(draft.map(item => item.direction)).toEqual(['OUTBOUND', 'RETURN']);
  });

  it('keeps the richest duplicate rather than the first empty one', () => {
    const deduped = dedupeFlightAnchors([
      anchor({ id: 'r1', direction: 'RETURN' }),
      anchor({ id: 'r2', direction: 'RETURN', departureDate: '2026-10-07', departureTime: '17:30', departureAirport: 'Gimhae International Airport' }),
    ]);
    expect(deduped?.map(item => item.id)).toEqual(['r2']);
  });

  it('reuses an existing anchor instead of recreating it', () => {
    const existing = anchor({ id: 'keep-me', direction: 'OUTBOUND', departureTime: '12:30' });
    const draft = buildFlightAnchorDraft([existing], TRIP);
    expect(draft[0].id).toBe('keep-me');
    expect(draft[0].departureTime).toBe('12:30');
  });
});

describe('prefill', () => {
  it('defaults dates from the trip range', () => {
    const draft = buildFlightAnchorDraft([], TRIP);
    expect(draft[0].departureDate).toBe('2026-09-14');
    expect(draft[1].departureDate).toBe('2026-10-07');
  });

  it('does not overwrite a date the user already set', () => {
    const existing = anchor({ id: 'o1', direction: 'OUTBOUND', departureDate: '2026-09-16' });
    expect(buildFlightAnchorDraft([existing], TRIP)[0].departureDate).toBe('2026-09-16');
  });

  it('prefills the Busan arrival airport because it has one obvious airport', () => {
    const draft = buildFlightAnchorDraft([], TRIP);
    expect(draft[0].arrivalAirportIata).toBe('PUS');
    expect(draft[0].arrivalAirport).toBe('Gimhae International Airport');
  });

  it('does not force an airport when the destination city has several', () => {
    const draft = buildFlightAnchorDraft([], { ...TRIP, destination: 'Taipei' });
    expect(draft[0].arrivalAirportIata).toBeUndefined();
    expect(destinationAirportCandidates('Taipei').map(item => item.iataCode)).toEqual(['TPE', 'TSA']);
  });

  it('uses an explicit home airport as the origin prefill', () => {
    const draft = buildFlightAnchorDraft([], { ...TRIP, homeAirportIata: 'YYZ' });
    expect(draft[0].departureAirportIata).toBe('YYZ');
  });

  it('leaves origin empty when no reliable origin is known', () => {
    expect(buildFlightAnchorDraft([], TRIP)[0].departureAirportIata).toBeUndefined();
  });

  it('mirrors the outbound pair onto the return leg', () => {
    const draft = buildFlightAnchorDraft([], { ...TRIP, homeAirportIata: 'YYZ' });
    expect(draft[0].departureAirportIata).toBe('YYZ');
    expect(draft[0].arrivalAirportIata).toBe('PUS');
    expect(draft[1].departureAirportIata).toBe('PUS');
    expect(draft[1].arrivalAirportIata).toBe('YYZ');
  });

  it('does not overwrite a return airport the user chose', () => {
    const outbound = applyAirport(
      anchor({ id: 'o1', direction: 'OUTBOUND' }),
      'arrival',
      findAirportByIata('PUS'),
    );
    const ret = applyAirport(anchor({ id: 'r1', direction: 'RETURN' }), 'departure', findAirportByIata('ICN'));
    const draft = buildFlightAnchorDraft([outbound, ret], TRIP);
    expect(draft[1].departureAirportIata).toBe('ICN');
  });
});

describe('canonical airport identity', () => {
  it('stores code, name, city, country and coordinates', () => {
    const saved = applyAirport(anchor({ id: 'o1', direction: 'OUTBOUND' }), 'departure', findAirportByIata('YYZ'));
    expect(saved.departureAirportIata).toBe('YYZ');
    expect(saved.departureAirport).toBe('Toronto Pearson International Airport');
    expect(saved.departureAirportCity).toBe('Toronto');
    expect(saved.departureAirportCountry).toBe('Canada');
    expect(typeof saved.departureAirportLatitude).toBe('number');
    expect(airportOf(saved, 'departure')?.iataCode).toBe('YYZ');
  });

  it('clears both sides of the identity when the selection is removed', () => {
    const saved = applyAirport(anchor({ id: 'o1', direction: 'OUTBOUND' }), 'arrival', findAirportByIata('PUS'));
    const cleared = applyAirport(saved, 'arrival', undefined);
    expect(cleared.arrivalAirport).toBeUndefined();
    expect(cleared.arrivalAirportIata).toBeUndefined();
  });
});

describe('validation', () => {
  it('names the exact missing field and leg', () => {
    const messages = validateFlightAnchors(buildFlightAnchorDraft([], TRIP)).map(error => error.message);
    expect(messages).toContain('請選擇去程出發時間');
    expect(messages).toContain('請選擇去程出發機場');
    expect(messages).toContain('請選擇回程抵達機場');
    expect(messages).not.toContain('請完成航班日期、時間與出發機場');
  });

  it('passes when every leg is complete', () => {
    const complete = buildFlightAnchorDraft([], { ...TRIP, homeAirportIata: 'YYZ' }).map(item => ({
      ...item,
      departureTime: '12:30',
    }));
    expect(validateFlightAnchors(complete)).toEqual([]);
  });
});

describe('time input parsing (Safari native control replacement)', () => {
  it('parses four digits into canonical HH:mm', () => {
    expect(parseTimeInput('1230')).toBe('12:30');
    expect(parseTimeInput('0530')).toBe('05:30');
    expect(parseTimeInput('2345')).toBe('23:45');
  });

  it('accepts an already-formatted value', () => {
    expect(parseTimeInput('12:30')).toBe('12:30');
    expect(parseTimeInput('05:30')).toBe('05:30');
  });

  it('returns undefined while the entry is partial', () => {
    expect(parseTimeInput('')).toBeUndefined();
    expect(parseTimeInput('1')).toBeUndefined();
    expect(parseTimeInput('12')).toBeUndefined();
    expect(parseTimeInput('12:3')).toBeUndefined();
  });

  it('rejects out-of-range hours and minutes rather than clamping', () => {
    expect(parseTimeInput('2500')).toBeUndefined();
    expect(parseTimeInput('1260')).toBeUndefined();
  });

  it('keeps midnight and preserves the leading zero', () => {
    expect(parseTimeInput('0000')).toBe('00:00');
    expect(parseTimeInput('0900')).toBe('09:00');
  });

  it('formats progressively while typing without inventing digits', () => {
    expect(formatTimeInput('1')).toBe('1');
    expect(formatTimeInput('12')).toBe('12');
    expect(formatTimeInput('123')).toBe('12:3');
    expect(formatTimeInput('1230')).toBe('12:30');
    expect(formatTimeInput('12:30')).toBe('12:30');
  });

  it('ignores stray non-digits and extra length', () => {
    expect(formatTimeInput('1a2b3c0')).toBe('12:30');
    expect(parseTimeInput('12:30:00')).toBe('12:30');
  });
});

describe('flightTimesLabel', () => {
  it('gives both times for an ordinary flight', () => {
    expect(flightTimesLabel({
      departureDate: '2026-10-02', departureTime: '16:35',
      arrivalDate: '2026-10-02', arrivalTime: '20:15',
    })).toEqual({ departure: '16:35', arrival: '20:15', dayOffset: 0 });
  });

  it('marks a landing on the next day', () => {
    // 23:40 → 03:15 with no marker reads as a flight going backwards in time.
    expect(flightTimesLabel({
      departureDate: '2026-10-02', departureTime: '23:40',
      arrivalDate: '2026-10-03', arrivalTime: '03:15',
    })).toEqual({ departure: '23:40', arrival: '03:15', dayOffset: 1 });
  });

  it('reports no arrival when none was entered', () => {
    // The card showed only a departure, so an arrival the traveller had never
    // filled in looked exactly like one they had — while everything after
    // landing silently depended on it.
    expect(flightTimesLabel({ departureDate: '2026-10-02', departureTime: '16:35' }))
      .toEqual({ departure: '16:35', dayOffset: 0 });
  });

  it('treats a same-day arrival as no offset even when both dates are given', () => {
    expect(flightTimesLabel({
      departureDate: '2026-10-02', departureTime: '09:30',
      arrivalDate: '2026-10-02', arrivalTime: '13:05',
    }).dayOffset).toBe(0);
  });

  it('does not invent an offset from an unreadable date', () => {
    expect(flightTimesLabel({
      departureDate: 'someday', departureTime: '09:30',
      arrivalDate: '2026-10-03', arrivalTime: '13:05',
    }).dayOffset).toBe(0);
  });

  it('survives an empty anchor', () => {
    expect(flightTimesLabel({})).toEqual({ departure: '', dayOffset: 0 });
  });
});
