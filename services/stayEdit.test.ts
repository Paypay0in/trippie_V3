/**
 * 「住宿資訊要可以編輯」.
 *
 * A stay could be deleted and typed again and nothing else, so correcting one
 * digit of a check-out time meant re-entering the name, both dates, both
 * times, the address and the confirmation number.
 *
 * The test that matters is the round trip: what `stayToItineraryItems` writes
 * is what this reads back, so an edit that changes nothing produces the
 * booking it started from.
 */
import { describe, expect, it } from 'vitest';
import { stayToItineraryItems } from './stayIntake';
import { stayBookings, stayFormFromItems } from './stayEdit';
import { ItineraryItem } from '../types';

const BOOKING = {
  hotelName: 'ハーモニーレジデンス浅草',
  checkInDate: '2026-10-20',
  checkInTime: '15:00',
  checkOutDate: '2026-10-24',
  checkOutTime: '11:00',
  address: '110042東京都台東区寿4丁目 6-2',
  confirmationNumber: 'T8B6SZ',
};

const asItems = (stay = BOOKING) => {
  let n = 0;
  return stayToItineraryItems(stay as never, () => `id-${n += 1}`) as unknown as ItineraryItem[];
};

describe('reading a saved booking back into the form', () => {
  it('returns every field it was made from', () => {
    expect(stayFormFromItems(asItems())).toEqual({
      hotelName: 'ハーモニーレジデンス浅草',
      checkInDate: '2026-10-20',
      checkInTime: '15:00',
      checkOutDate: '2026-10-24',
      checkOutTime: '11:00',
      address: '110042東京都台東区寿4丁目 6-2',
      confirmationNumber: 'T8B6SZ',
    });
  });

  /*
    `stayToItineraryItems` puts the address into `location`, falling back to
    the hotel name when there is no address — so reading `location` back would
    file the hotel's name as the address of every booking without one.
  */
  it('leaves the address empty rather than filling it with the name', () => {
    const items = asItems({ ...BOOKING, address: undefined } as never);

    expect(stayFormFromItems(items).address).toBe('');
    expect(stayFormFromItems(items).hotelName).toBe('ハーモニーレジデンス浅草');
  });

  it('survives a booking with no confirmation number', () => {
    const items = asItems({ ...BOOKING, confirmationNumber: undefined } as never);

    expect(stayFormFromItems(items).confirmationNumber).toBe('');
  });

  /** A one-way stay — check-in entered, check-out not yet. */
  it('reads a booking with only a check-in', () => {
    const items = asItems({ ...BOOKING, checkOutDate: undefined } as never);
    const form = stayFormFromItems(items);

    expect(form.checkInDate).toBe('2026-10-20');
    expect(form.checkOutDate).toBe('');
    expect(form.hotelName).toBe('ハーモニーレジデンス浅草');
  });

  it('says nothing for no items at all', () => {
    expect(stayFormFromItems([]).hotelName).toBe('');
  });
});

describe('which cards belong to one booking', () => {
  it('pairs the check-in with its check-out', () => {
    const bookings = stayBookings(asItems());

    expect(bookings.size).toBe(1);
    expect(bookings.get('ハーモニーレジデンス浅草')).toHaveLength(2);
  });

  it('keeps two different hotels apart', () => {
    const bookings = stayBookings([
      ...asItems(),
      ...asItems({ ...BOOKING, hotelName: '東橫INN' } as never),
    ]);

    expect(Array.from(bookings.keys()).sort()).toEqual(['ハーモニーレジデンス浅草', '東橫INN']);
  });

  /** Nothing else on the itinerary is a booking. */
  it('ignores items that are not accommodation', () => {
    const items = [
      ...asItems(),
      { id: 'x', type: 'ACTIVITY', title: '淺草寺', location: '', notes: '', time: '12:00' },
    ] as ItineraryItem[];

    expect(stayBookings(items).size).toBe(1);
  });
});
