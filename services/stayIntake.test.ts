import { describe, expect, it } from 'vitest';
import { normalizeParsedStay, stayNights, stayToItineraryItems } from './stayIntake';

let counter = 0;
const makeId = () => `stay-${++counter}`;

const booking = {
  hotelName: '海雲台格蘭飯店',
  checkInDate: '2026-10-02',
  checkOutDate: '2026-10-07',
  checkInTime: '15:00',
  checkOutTime: '11:00',
  address: '釜山廣域市海雲台區',
  confirmationNumber: 'ABC-12345',
};

describe('normalizeParsedStay', () => {
  it('keeps a complete booking', () => {
    expect(normalizeParsedStay(booking)).toMatchObject({
      hotelName: '海雲台格蘭飯店',
      checkInDate: '2026-10-02',
      checkOutDate: '2026-10-07',
      confirmationNumber: 'ABC-12345',
    });
  });

  it('refuses a booking with no property name, which is nothing to file', () => {
    expect(normalizeParsedStay({ checkInDate: '2026-10-02' })).toBeNull();
    expect(normalizeParsedStay({ hotelName: '   ' })).toBeNull();
    expect(normalizeParsedStay(null)).toBeNull();
  });

  it('drops a check-out that precedes check-in and flags the read as uncertain', () => {
    const stay = normalizeParsedStay({ ...booking, checkOutDate: '2026-09-28' });
    expect(stay?.checkOutDate).toBeUndefined();
    expect(stay?.isUncertain).toBe(true);
    // The check-in still survives; half a booking beats none.
    expect(stay?.checkInDate).toBe('2026-10-02');
  });

  it('drops dates that are not ISO rather than guessing at a format', () => {
    expect(normalizeParsedStay({ ...booking, checkInDate: '2 Oct 2026' })?.checkInDate).toBeUndefined();
  });

  it('normalizes times and refuses impossible ones', () => {
    expect(normalizeParsedStay({ ...booking, checkInTime: '9:00' })?.checkInTime).toBe('09:00');
    expect(normalizeParsedStay({ ...booking, checkInTime: '15：00' })?.checkInTime).toBe('15:00');
    expect(normalizeParsedStay({ ...booking, checkInTime: '25:00' })?.checkInTime).toBeUndefined();
    expect(normalizeParsedStay({ ...booking, checkOutTime: 'noon' })?.checkOutTime).toBeUndefined();
  });

  it('drops an amount with no currency, which nobody can act on', () => {
    expect(normalizeParsedStay({ ...booking, totalAmount: 450000 })?.totalAmount).toBeUndefined();
    expect(normalizeParsedStay({ ...booking, totalAmount: 450000, currency: 'krw' })).toMatchObject({
      totalAmount: 450000,
      currency: 'KRW',
    });
  });
});

describe('stayToItineraryItems', () => {
  it('puts check-in and check-out on their own days', () => {
    const items = stayToItineraryItems(normalizeParsedStay(booking)!, makeId);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ date: '2026-10-02', time: '15:00', type: 'HOTEL' });
    expect(items[0].title).toContain('入住');
    expect(items[1]).toMatchObject({ date: '2026-10-07', time: '11:00' });
    expect(items[1].title).toContain('退房');
  });

  it('marks both as fixed, so the planner may not move a booked room', () => {
    const items = stayToItineraryItems(normalizeParsedStay(booking)!, makeId);
    for (const item of items) {
      expect(item.scheduleFlexibility).toBe('fixed');
      expect(item.fixedEventKind).toBe('accommodation');
    }
  });

  it('states the night count on the check-in item', () => {
    const items = stayToItineraryItems(normalizeParsedStay(booking)!, makeId);
    expect(items[0].notes).toContain('共 5 晚');
    expect(items[0].notes).toContain('2026-10-07 退房');
  });

  it('falls back to standard hotel times rather than an empty slot', () => {
    const stay = normalizeParsedStay({ ...booking, checkInTime: undefined, checkOutTime: undefined })!;
    const items = stayToItineraryItems(stay, makeId);
    expect(items[0].time).toBe('15:00');
    expect(items[1].time).toBe('11:00');
  });

  it('carries the booking reference into the notes', () => {
    const items = stayToItineraryItems(normalizeParsedStay(booking)!, makeId);
    expect(items[0].notes).toContain('ABC-12345');
  });

  it('warns on the item itself when the screenshot was not read cleanly', () => {
    const stay = normalizeParsedStay({ ...booking, isUncertain: true })!;
    expect(stayToItineraryItems(stay, makeId)[0].notes).toContain('請核對');
  });

  it('keeps a dateless booking instead of discarding it', () => {
    const stay = normalizeParsedStay({ hotelName: '某間民宿' })!;
    const items = stayToItineraryItems(stay, makeId);
    expect(items).toHaveLength(1);
    expect(items[0].date).toBeUndefined();
    expect(items[0].title).toBe('某間民宿');
  });

  it('produces only a check-in when check-out was unreadable', () => {
    const stay = normalizeParsedStay({ ...booking, checkOutDate: undefined })!;
    const items = stayToItineraryItems(stay, makeId);
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-10-02');
    expect(items[0].notes).not.toContain('晚');
  });
});

describe('stayNights', () => {
  it('covers every night slept, not the check-out morning', () => {
    expect(stayNights(normalizeParsedStay(booking)!)).toEqual([
      '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06',
    ]);
  });

  it('returns nothing when the stay has no span', () => {
    expect(stayNights(normalizeParsedStay({ hotelName: 'X' })!)).toEqual([]);
    expect(stayNights(normalizeParsedStay({ ...booking, checkOutDate: '2026-10-02' })!)).toEqual([]);
  });
});
