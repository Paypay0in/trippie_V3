import { describe, expect, it } from 'vitest';
import {
  hasCarOn, normalizeParsedRental, rentalDays,
} from './rentalIntake';
import { formatRentalSpan } from './rentalSpanWording';

/**
 * 「可以在安排行程那加上租車訂單等」, and the question it answers:
 * 「是租兩天的車等 但旅行有五天」.
 *
 * A hire is a span, never a flag. Most of these are about the span staying
 * honest when the confirmation is only half readable.
 */

const okinawa = {
  company: 'OTS レンタカー',
  pickUpDate: '2026-10-03', pickUpTime: '10:00',
  dropOffDate: '2026-10-05', dropOffTime: '18:00',
  pickUpLocation: '那覇空港営業所',
};

describe('reading a confirmation', () => {
  it('keeps what it was given', () => {
    const rental = normalizeParsedRental(okinawa)!;
    expect(rental).toMatchObject({
      company: 'OTS レンタカー', pickUpDate: '2026-10-03', dropOffTime: '18:00',
    });
  });

  /** The same refusal a hotel with no name gets: no company, no record. */
  it('refuses a confirmation with no company', () => {
    expect(normalizeParsedRental({ ...okinawa, company: '  ' })).toBeNull();
    expect(normalizeParsedRental({})).toBeNull();
    expect(normalizeParsedRental(null)).toBeNull();
  });

  it('normalises a full-width colon in the time', () => {
    expect(normalizeParsedRental({ ...okinawa, pickUpTime: '9：05' })!.pickUpTime).toBe('09:05');
  });

  it('drops a time that is not one', () => {
    expect(normalizeParsedRental({ ...okinawa, dropOffTime: 'afternoon' })!.dropOffTime)
      .toBeUndefined();
  });

  /** Returned before collected is a misread, not a hire that ran backwards. */
  it('drops a drop-off that falls before the pickup, and says it is unsure', () => {
    const rental = normalizeParsedRental({ ...okinawa, dropOffDate: '2026-10-01' })!;
    expect(rental.dropOffDate).toBeUndefined();
    expect(rental.isUncertain).toBe(true);
  });

  /** One branch, said once. */
  it('does not repeat the pickup branch as the drop-off', () => {
    const rental = normalizeParsedRental({ ...okinawa, dropOffLocation: '那覇空港営業所' })!;
    expect(rental.dropOffLocation).toBeUndefined();
  });

  it('keeps a drop-off that is genuinely elsewhere', () => {
    const rental = normalizeParsedRental({ ...okinawa, dropOffLocation: '名護営業所' })!;
    expect(rental.dropOffLocation).toBe('名護営業所');
  });

  /** An amount with no currency is a number nobody can act on. */
  it('drops a total with no currency', () => {
    expect(normalizeParsedRental({ ...okinawa, totalAmount: 18000 })!.totalAmount)
      .toBeUndefined();
    expect(normalizeParsedRental({ ...okinawa, totalAmount: 18000, currency: 'jpy' })!)
      .toMatchObject({ totalAmount: 18000, currency: 'JPY' });
  });
});

describe('which days the traveller has the keys', () => {
  /**
   * The whole point. Collected 10:00 on the 3rd, returned 18:00 on the 5th:
   * three drivable days out of a five-day trip.
   */
  it('counts both ends', () => {
    expect(rentalDays(okinawa)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
  });

  it('is one day for a same-day hire', () => {
    expect(rentalDays({ pickUpDate: '2026-10-03', dropOffDate: '2026-10-03' }))
      .toEqual(['2026-10-03']);
  });

  it('crosses a month end', () => {
    expect(rentalDays({ pickUpDate: '2026-10-31', dropOffDate: '2026-11-01' }))
      .toEqual(['2026-10-31', '2026-11-01']);
  });

  /**
   * A half-known hire is exactly where guessing the other end puts a car on
   * days nobody said it was there.
   */
  it('claims no days when only one end is known', () => {
    expect(rentalDays({ pickUpDate: '2026-10-03' })).toEqual([]);
    expect(rentalDays({ dropOffDate: '2026-10-05' })).toEqual([]);
    expect(rentalDays({})).toEqual([]);
  });

  it('answers whether a given day is drivable', () => {
    const rentals = [normalizeParsedRental(okinawa)!];
    expect(hasCarOn(rentals, '2026-10-04')).toBe(true);
    expect(hasCarOn(rentals, '2026-10-02')).toBe(false);
    expect(hasCarOn(rentals, '2026-10-06')).toBe(false);
  });

  it('covers a trip hired in two separate stretches', () => {
    const rentals = [
      normalizeParsedRental(okinawa)!,
      normalizeParsedRental({ company: 'Hertz', pickUpDate: '2026-10-08', dropOffDate: '2026-10-09' })!,
    ];
    expect(hasCarOn(rentals, '2026-10-08')).toBe(true);
    expect(hasCarOn(rentals, '2026-10-07')).toBe(false);
  });
});

describe('saying the span on screen', () => {
  it('shows both ends with their times', () => {
    expect(formatRentalSpan(okinawa)).toBe('10/03 10:00 – 10/05 18:00');
  });

  it('drops the time it was not given', () => {
    expect(formatRentalSpan({ company: 'x', pickUpDate: '2026-10-03', dropOffDate: '2026-10-05' }))
      .toBe('10/03 – 10/05');
  });

  it('says so rather than inventing the other end', () => {
    expect(formatRentalSpan({ company: 'x', pickUpDate: '2026-10-03' })).toBe('10/03');
    expect(formatRentalSpan({ company: 'x' })).toBe('日期待確認');
  });
});
