/**
 * A saved booking, read back into the form that made it.
 *
 * 「住宿資訊要可以編輯」. A stay could be deleted and typed again, and nothing
 * else — so correcting one wrong digit in a check-out time meant re-entering
 * the name, both dates, both times, the address and the confirmation number,
 * and the pair of itinerary cards it produces got new ids on the way through.
 *
 * This is the exact inverse of `stayToItineraryItems`. Written against that
 * function rather than guessed at: whatever it puts into the title and the
 * notes is what is taken back out here, so an edit that changes nothing
 * produces the booking it started from.
 */
import { ItineraryItem } from '../types';
import { stayPropertyName, stayRoleOf } from './stayConflicts';

export interface StayForm {
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
  checkInTime: string;
  checkOutTime: string;
  address: string;
  confirmationNumber: string;
}

export const EMPTY_STAY_FORM: StayForm = {
  hotelName: '',
  checkInDate: '',
  checkOutDate: '',
  checkInTime: '',
  checkOutTime: '',
  address: '',
  confirmationNumber: '',
};

/**
 * The two cards of one booking.
 *
 * Keyed on the property name, which is what `stayPropertyName` already reads
 * out of the title — the same key the duplicate check uses, so a booking is
 * one booking to both of them.
 */
export const stayBookings = (items: ItineraryItem[]): Map<string, ItineraryItem[]> => {
  const groups = new Map<string, ItineraryItem[]>();
  items
    .filter(item => item.type === 'HOTEL' && item.fixedEventKind === 'accommodation')
    .forEach(item => {
      const name = stayPropertyName(item);
      if (!name) return;
      groups.set(name, [...(groups.get(name) || []), item]);
    });
  return groups;
};

/** 「訂房編號：ABC123」, as `stayToItineraryItems` wrote it. */
const confirmationIn = (notes?: string): string =>
  (notes || '').match(/訂房編號：(.+)/)?.[1]?.trim() || '';

export const stayFormFromItems = (items: ItineraryItem[]): StayForm => {
  const checkIn = items.find(item => stayRoleOf(item) === 'check_in');
  const checkOut = items.find(item => stayRoleOf(item) === 'check_out');
  const anyOf = checkIn || checkOut;

  return {
    hotelName: anyOf ? stayPropertyName(anyOf) : '',
    checkInDate: checkIn?.date || '',
    checkInTime: checkIn?.time || '',
    checkOutDate: checkOut?.date || '',
    checkOutTime: checkOut?.time || '',
    /*
      The address, not the location. `stayToItineraryItems` writes the address
      into both, falling back to the hotel name when there is no address — so
      reading `location` back would put the hotel's name in the address field
      of every booking that never had one.
    */
    address: anyOf?.address || '',
    confirmationNumber: confirmationIn(checkIn?.notes || checkOut?.notes),
  };
};
