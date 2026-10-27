import { describe, expect, it } from 'vitest';
import { FlightAnchor } from '../types';
import { localToday, phaseForDate, returnLandingDate } from './tripPhaseByDate';

const flight = (anchor: Partial<FlightAnchor>): FlightAnchor =>
  ({
    id: anchor.id || 'f1',
    direction: anchor.direction || 'RETURN',
    departureDate: anchor.departureDate || '2026-10-24',
    departureTime: '20:00',
    departureAirport: 'HND',
    airportArrivalBufferMinutes: 120,
    source: 'MANUAL',
    ...anchor,
  }) as FlightAnchor;

describe('phaseForDate', () => {
  it('is 行前 before departure', () => {
    expect(phaseForDate('2026-09-10', '2026-09-20', '2026-09-25')).toBe('pre');
  });

  it('is 旅行中 on the first and last day, not just between them', () => {
    expect(phaseForDate('2026-09-20', '2026-09-20', '2026-09-25')).toBe('during');
    expect(phaseForDate('2026-09-25', '2026-09-20', '2026-09-25')).toBe('during');
  });

  it('is 返程 once the trip is over', () => {
    expect(phaseForDate('2026-09-26', '2026-09-20', '2026-09-25')).toBe('post');
  });

  it('says nothing when the trip has no dates', () => {
    // Callers then keep whatever they worked out from the ledger.
    expect(phaseForDate('2026-09-26', '', '')).toBeNull();
  });

  it('copes with only one date known', () => {
    expect(phaseForDate('2026-09-26', '2026-09-20')).toBe('during');
    expect(phaseForDate('2026-09-10', '2026-09-20')).toBe('pre');
  });

  it('reads today in the local day, not UTC', () => {
    expect(localToday(new Date('2026-09-15T23:30:00'))).toBe('2026-09-15');
  });
});

/**
 * 「目前旅程都已經完成了」.
 *
 * 釜山 ran 2026/10/02–10/07. On 10/10 the workspace still said RETURN 返程中
 * while the home screen called the same trip 已結束的旅程 — one trip saying two
 * things on two screens, which is worse than either being wrong, because then
 * neither can be trusted.
 *
 * 'post' is 回國機場消費: the journey home and the spending on it. It is a day,
 * not a state a trip stays in forever.
 */
describe('a trip that is over', () => {
  it('is 返程中 on the day after it ends, when you are travelling home', () => {
    expect(phaseForDate('2026-10-08', '2026-10-02', '2026-10-07')).toBe('post');
  });

  it('is finished two days later, not still coming home', () => {
    expect(phaseForDate('2026-10-09', '2026-10-02', '2026-10-07')).toBe('summary');
  });

  /** The exact report: 釜山, three days after it ended. */
  it('does not say 返程中 three days after the trip ended', () => {
    expect(phaseForDate('2026-10-10', '2026-10-02', '2026-10-07')).toBe('summary');
  });

  it('is still the trip on its last day', () => {
    expect(phaseForDate('2026-10-07', '2026-10-02', '2026-10-07')).toBe('during');
  });

  /** Month and year ends are where off-by-one date maths shows up. */
  it('crosses the end of a month correctly', () => {
    expect(phaseForDate('2026-11-01', '2026-10-25', '2026-10-31')).toBe('post');
    expect(phaseForDate('2026-11-02', '2026-10-25', '2026-10-31')).toBe('summary');
  });

  it('crosses the end of a year correctly', () => {
    expect(phaseForDate('2027-01-01', '2026-12-20', '2026-12-31')).toBe('post');
    expect(phaseForDate('2027-01-02', '2026-12-20', '2026-12-31')).toBe('summary');
  });

  it('is finished long afterwards, not permanently returning', () => {
    expect(phaseForDate('2027-06-01', '2026-10-02', '2026-10-07')).toBe('summary');
  });
});

/**
 * 「我的東京旅程我已經按完成」, and the badge still said RETURN 返程中.
 *
 * 東京 ran 2026/10/20–10/24 on an evening flight that landed the same night.
 * The traveller had been home a day, and 「結束日 +1」 still called it 返程中 —
 * because the day was guessed from the end date instead of read off the return
 * flight, which carries the landing date the whole time.
 */
describe('a trip whose return flight says when it landed', () => {
  it('is finished the day after landing, not 返程中', () => {
    // Landed 10/24, the trip's own last day. 10/25 you have been home a day.
    expect(phaseForDate('2026-10-25', '2026-10-20', '2026-10-24', '2026-10-24')).toBe(
      'summary',
    );
  });

  it('is still the trip on the day it lands', () => {
    expect(phaseForDate('2026-10-24', '2026-10-20', '2026-10-24', '2026-10-24')).toBe(
      'during',
    );
  });

  it('is 返程中 on a landing day that falls after the trip ends', () => {
    // Red-eye out of 羽田 on the 24th, home on the 25th.
    expect(phaseForDate('2026-10-25', '2026-10-20', '2026-10-24', '2026-10-25')).toBe(
      'post',
    );
    expect(phaseForDate('2026-10-26', '2026-10-20', '2026-10-24', '2026-10-25')).toBe(
      'summary',
    );
  });

  it('trusts a long way home over the guessed single day', () => {
    // Two-stopover return landing 10/27: still coming home on the 26th, where
    // 「結束日 +1」 would already have called the trip finished.
    expect(phaseForDate('2026-10-26', '2026-10-20', '2026-10-24', '2026-10-27')).toBe(
      'post',
    );
    expect(phaseForDate('2026-10-27', '2026-10-20', '2026-10-24', '2026-10-27')).toBe(
      'post',
    );
    expect(phaseForDate('2026-10-28', '2026-10-20', '2026-10-24', '2026-10-27')).toBe(
      'summary',
    );
  });

  it('falls back to the guess when the flight does not say', () => {
    // Identical to the behaviour before the landing date was read at all.
    expect(phaseForDate('2026-10-25', '2026-10-20', '2026-10-24', '')).toBe('post');
    expect(phaseForDate('2026-10-26', '2026-10-20', '2026-10-24', undefined)).toBe(
      'summary',
    );
  });
});

describe('returnLandingDate', () => {
  it('reads the arrival date off the return flight', () => {
    expect(
      returnLandingDate([
        flight({ id: 'out', direction: 'OUTBOUND', arrivalDate: '2026-10-20' }),
        flight({ id: 'back', direction: 'RETURN', arrivalDate: '2026-10-24' }),
      ]),
    ).toBe('2026-10-24');
  });

  it('ignores the outbound flight, which lands at the start', () => {
    expect(
      returnLandingDate([
        flight({ id: 'out', direction: 'OUTBOUND', arrivalDate: '2026-10-20' }),
      ]),
    ).toBeUndefined();
  });

  it('says nothing when the return flight has no arrival date', () => {
    // A flight that departs 10/24 may land 10/24 or 10/25. Guessing which is
    // how the badge got it wrong in the first place.
    expect(returnLandingDate([flight({ departureDate: '2026-10-24' })])).toBeUndefined();
  });

  it('takes the last landing when the way home has more than one leg', () => {
    expect(
      returnLandingDate([
        flight({ id: 'leg2', arrivalDate: '2026-10-27' }),
        flight({ id: 'leg1', arrivalDate: '2026-10-25' }),
      ]),
    ).toBe('2026-10-27');
  });

  it('says nothing when there are no flights at all', () => {
    expect(returnLandingDate(undefined)).toBeUndefined();
    expect(returnLandingDate([])).toBeUndefined();
  });
});
