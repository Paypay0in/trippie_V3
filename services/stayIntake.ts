/**
 * Turning a booking screenshot into a stay.
 *
 * Nobody retypes a hotel confirmation. The screenshot is already on the phone,
 * so it is the input.
 *
 * A stay becomes itinerary items rather than a field on the trip, and that is
 * deliberate: the itinerary is one of the three things that sync between
 * travellers. Flight anchors live on the trip object and do not sync, so a
 * companion never sees them — modelling accommodation the same way would have
 * shipped the same hole on a trip taken by two people.
 *
 * Everything here is pure; the provider call is injected by the caller.
 */

import { addLocalDays } from './localDate';

export const STAY_MODEL = 'gemini-3-flash-preview';

export interface ParsedStay {
  hotelName: string;
  checkInDate?: string;
  checkOutDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  address?: string;
  confirmationNumber?: string;
  guestName?: string;
  /** The booking's own total, only when the screenshot states one. */
  totalAmount?: number;
  currency?: string;
  isUncertain?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const cleanTime = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().replace('：', ':').match(CLOCK);
  if (!match) return undefined;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

/**
 * A booking that cannot name the hotel is not a booking we can file, and a
 * check-out before check-in is a misread rather than a short stay. Both are
 * refused: an empty form the traveller fills in is recoverable, a confidently
 * wrong hotel on the wrong night is not.
 */
export const normalizeParsedStay = (raw: unknown): ParsedStay | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  const hotelName = typeof value.hotelName === 'string' ? value.hotelName.trim().slice(0, 120) : '';
  if (!hotelName) return null;

  const stay: ParsedStay = { hotelName };

  for (const field of ['checkInDate', 'checkOutDate'] as const) {
    const date = value[field];
    if (typeof date === 'string' && ISO_DATE.test(date.trim())) stay[field] = date.trim();
  }
  // Out before in means the screenshot was misread, not that time ran backwards.
  if (stay.checkInDate && stay.checkOutDate && stay.checkOutDate < stay.checkInDate) {
    delete stay.checkOutDate;
    stay.isUncertain = true;
  }

  const checkInTime = cleanTime(value.checkInTime);
  if (checkInTime) stay.checkInTime = checkInTime;
  const checkOutTime = cleanTime(value.checkOutTime);
  if (checkOutTime) stay.checkOutTime = checkOutTime;

  for (const field of ['address', 'confirmationNumber', 'guestName'] as const) {
    const text = value[field];
    if (typeof text === 'string' && text.trim()) stay[field] = text.trim().slice(0, 200);
  }

  const total = typeof value.totalAmount === 'number' ? value.totalAmount : Number(value.totalAmount);
  if (Number.isFinite(total) && total > 0) stay.totalAmount = total;

  if (typeof value.currency === 'string') {
    const currency = value.currency.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency)) stay.currency = currency;
  }
  // An amount with no currency is a number nobody can act on.
  if (stay.totalAmount !== undefined && !stay.currency) delete stay.totalAmount;

  if (value.isUncertain === true) stay.isUncertain = true;

  return stay;
};

export const stayPrompt = () => `
      Analyze this image. It is a hotel, guesthouse, or short-stay booking
      confirmation — from a booking site, an email, or the property itself.

      Extract:
      1. "hotelName": the property name, as written.
      2. "checkInDate" and "checkOutDate": as YYYY-MM-DD.
      3. "checkInTime" and "checkOutTime": as HH:mm, 24-hour, only if stated.
      4. "address": the street address, only if shown.
      5. "confirmationNumber": the booking or reservation reference, only if shown.
      6. "guestName": the name the booking is under, only if shown.
      7. "totalAmount" and "currency": the booking total and its ISO 4217 code,
         only if the image states a total. Do not compute or estimate one.

      Rules:
      - Return only what the image actually shows. Omit anything it does not.
      - The nights count is not a date. Derive checkOutDate only if the image
        shows it directly.
      - Set "isUncertain" to true if the image is blurry, cropped, or ambiguous.

      Return JSON.
    `;

/**
 * The itinerary items a stay becomes: one on the check-in day, one on the
 * check-out day.
 *
 * Two items rather than one because they sit on different days and the
 * traveller needs each on the day it happens — a single item on the check-in
 * date leaves the check-out morning blank, which is exactly when someone is
 * trying to remember what time they have to be out.
 *
 * Both are marked `fixed`: a booked room is a hard constraint, and the planner
 * may not move it to make an afternoon fit.
 */
export const stayToItineraryItems = (
  stay: ParsedStay,
  makeId: () => string,
): Array<{
  id: string;
  type: 'HOTEL';
  title: string;
  location: string;
  address?: string;
  notes: string;
  date?: string;
  time: string;
  scheduleFlexibility: 'fixed';
  fixedEventKind: 'accommodation';
}> => {
  const base = {
    type: 'HOTEL' as const,
    location: stay.address || stay.hotelName,
    address: stay.address,
    scheduleFlexibility: 'fixed' as const,
    fixedEventKind: 'accommodation' as const,
  };

  const detail = [
    stay.confirmationNumber ? `訂房編號：${stay.confirmationNumber}` : '',
    stay.guestName ? `訂房人：${stay.guestName}` : '',
    stay.totalAmount !== undefined && stay.currency ? `訂房金額：${stay.currency} ${stay.totalAmount}` : '',
    stay.isUncertain ? '⚠️ 截圖辨識不完全，請核對' : '',
  ].filter(Boolean).join('\n');

  const items = [];

  if (stay.checkInDate) {
    const nights = stay.checkOutDate
      ? Math.round((Date.parse(`${stay.checkOutDate}T00:00:00Z`) - Date.parse(`${stay.checkInDate}T00:00:00Z`)) / 86_400_000)
      : 0;
    items.push({
      ...base,
      id: makeId(),
      title: `入住 ${stay.hotelName}`,
      date: stay.checkInDate,
      // 15:00 is the near-universal hotel check-in, and a blank time sorts an
      // item to the top of the day, above the morning it does not belong in.
      time: stay.checkInTime || '15:00',
      notes: [
        nights > 0 ? `共 ${nights} 晚，${stay.checkOutDate} 退房` : '',
        detail,
      ].filter(Boolean).join('\n'),
    });
  }

  if (stay.checkOutDate) {
    items.push({
      ...base,
      id: makeId(),
      title: `退房 ${stay.hotelName}`,
      date: stay.checkOutDate,
      time: stay.checkOutTime || '11:00',
      notes: detail,
    });
  }

  // A booking with no dates at all still belongs on the trip; it lands
  // undated so the traveller can drop it on the right day rather than
  // having it silently discarded.
  if (items.length === 0) {
    items.push({ ...base, id: makeId(), title: stay.hotelName, date: undefined, time: '', notes: detail });
  }

  return items;
};

/** Every night covered by a stay, for showing which days have a room booked. */
export const stayNights = (stay: ParsedStay): string[] => {
  if (!stay.checkInDate || !stay.checkOutDate) return [];
  const nights: string[] = [];
  let cursor = stay.checkInDate;
  while (cursor < stay.checkOutDate && nights.length < 366) {
    nights.push(cursor);
    cursor = addLocalDays(cursor, 1);
    if (!cursor) break;
  }
  return nights;
};
