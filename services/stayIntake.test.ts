import { describe, expect, it } from 'vitest';
import { normalizeParsedStay, stayForNight, stayNights, staysFromItinerary, stayToItineraryItems } from './stayIntake';

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

describe('staysFromItinerary — knowing where you sleep on the nights between', () => {
  // What a parsed booking actually becomes on the itinerary.
  const items = stayToItineraryItems(normalizeParsedStay(booking)!, makeId).map(item => ({
    ...item,
    type: item.type as string,
    fixedEventKind: item.fixedEventKind as string,
  }));

  const otherDayItem = {
    id: 'lunch', type: 'FOOD', title: '午餐', date: '2026-10-04', location: '札嘎其市場',
  };

  it('pairs the check-in and check-out cards back into one stay', () => {
    const [stay] = staysFromItinerary([...items, otherDayItem]);
    expect(stay.name).toBe('海雲台格蘭飯店');
    expect(stay.checkInDate).toBe('2026-10-02');
    expect(stay.checkOutDate).toBe('2026-10-07');
  });

  it('covers every night between, which is most of the trip', () => {
    const stays = staysFromItinerary(items);
    // The days that previously said nothing about accommodation.
    for (const night of ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']) {
      expect(stayForNight(stays, night)?.name).toBe('海雲台格蘭飯店');
    }
  });

  it('covers the check-in night', () => {
    expect(stayForNight(staysFromItinerary(items), '2026-10-02')?.name).toBe('海雲台格蘭飯店');
  });

  it('does not claim a room on the morning they check out', () => {
    // They hand the key back that day; saying 住宿 would be telling them they
    // have a room they no longer have.
    expect(stayForNight(staysFromItinerary(items), '2026-10-07')).toBeUndefined();
  });

  it('says nothing for a night outside the stay', () => {
    expect(stayForNight(staysFromItinerary(items), '2026-10-01')).toBeUndefined();
    expect(stayForNight(staysFromItinerary(items), '')).toBeUndefined();
    expect(stayForNight([], '2026-10-03')).toBeUndefined();
  });

  it('ignores items that are not accommodation', () => {
    expect(staysFromItinerary([otherDayItem])).toEqual([]);
    // A HOTEL-typed item that is not a stay card, e.g. hand-entered.
    expect(staysFromItinerary([{ id: 'x', type: 'HOTEL', title: '某飯店' }])).toEqual([]);
  });

  it('handles two consecutive stays without mixing them up', () => {
    const second = stayToItineraryItems(
      normalizeParsedStay({ hotelName: '西面商務旅館', checkInDate: '2026-10-05', checkOutDate: '2026-10-07' })!,
      makeId,
    ).map(item => ({ ...item, type: item.type as string, fixedEventKind: item.fixedEventKind as string }));

    const stays = staysFromItinerary([...items, ...second]);
    expect(stays).toHaveLength(2);
    expect(stayForNight(stays, '2026-10-03')?.name).toBe('海雲台格蘭飯店');
    // Overlapping nights resolve to the first match rather than showing both;
    // a night with two rooms booked is a data problem, not a display one.
    expect(stayForNight(stays, '2026-10-06')).toBeDefined();
  });

  it('keeps a dateless booking out of every night rather than guessing one', () => {
    const dateless = stayToItineraryItems(normalizeParsedStay({ hotelName: '某民宿' })!, makeId)
      .map(item => ({ ...item, type: item.type as string, fixedEventKind: item.fixedEventKind as string }));
    const stays = staysFromItinerary(dateless);
    expect(stays[0].nights).toEqual([]);
    expect(stayForNight(stays, '2026-10-03')).toBeUndefined();
  });

  it('carries the address through for the banner to show', () => {
    expect(staysFromItinerary(items)[0].address).toBe('釜山廣域市海雲台區');
  });
});
