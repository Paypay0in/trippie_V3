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

import { addLocalDays, fromLocalIsoDate } from './localDate';
import { reachHotelTime } from './arrivalPlan';

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
/** When a flight puts the traveller on the ground, per date. */
export interface FlightArrival {
  date: string;
  time: string;
}

/** Hours between landing and realistically standing at a hotel desk. */
const HOURS_FROM_LANDING_TO_CHECK_IN = 2;

const addHours = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  // Clamped rather than rolled into the next day: an arrival late enough to
  // push past midnight means check-in is that night, not tomorrow, and moving
  // the item to another date would take it off the day it belongs to.
  const total = Math.min(23 * 60 + 59, h * 60 + m + hours * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The check-in time to use when the booking did not state one.
 *
 * Two hours after the flight lands, because that is when the traveller is
 * actually at the door — immigration, baggage, and the ride in. A flat 15:00
 * put the card in the wrong half of the day for a morning landing and a late
 * one alike.
 *
 * Only an arrival on the same date counts: a flight two days earlier says
 * nothing about when they reach this hotel.
 */
export const defaultCheckInTime = (checkInDate: string | undefined, arrivals: FlightArrival[] = []): string => {
  const sameDay = arrivals.find(arrival => arrival.date === checkInDate && arrival.time);
  // One rule, shared with the transfer card: clear the airport, then ride in.
  // Computing it separately here is what put check-in at the same minute as the
  // car that takes them there.
  if (sameDay) return reachHotelTime(sameDay.time) ?? addHours(sameDay.time, HOURS_FROM_LANDING_TO_CHECK_IN);
  // No flight that day: the near-universal hotel check-in hour.
  return '15:00';
};

export const stayToItineraryItems = (
  stay: ParsedStay,
  makeId: () => string,
  arrivals: FlightArrival[] = [],
): Array<{
  id: string;
  type: 'HOTEL';
  title: string;
  location: string;
  address?: string;
  notes: string;
  date?: string;
  time: string;
  fixedEventKind: 'accommodation';
}> => {
  const base = {
    type: 'HOTEL' as const,
    location: stay.address || stay.hotelName,
    address: stay.address,
    // Not marked fixed. A booked room is a commitment, but the hour you walk
    // in is not: arriving late, dropping bags early, or reordering the day
    // around it are all ordinary. `fixedEventKind` stays as the marker that
    // identifies these as accommodation — it is the field already stored and
    // synced, so changing it would orphan every stay entered before now.
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
      time: stay.checkInTime || defaultCheckInTime(stay.checkInDate, arrivals),
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

export interface StaySpan {
  /** The property, as the traveller entered or uploaded it. */
  name: string;
  checkInDate?: string;
  checkOutDate?: string;
  address?: string;
  /** Every night slept here; empty when the span is unknown. */
  nights: string[];
  /*
    The resolved place, when the booking has one.

    Carried so the airport transfer can be a real journey between two points.
    「輸入旅館的當下就已經應該帶入地址，就能夠依機場與旅館地址給交通建議與預估了」.
  */
  placeId?: string;
  latitude?: number;
  longitude?: number;
  /** The check-in item, so the banner can open the detail the card holds. */
  itemId: string;
}

/** Either card of a booking may be the linked one; the first one that is wins. */
const carryPlace = (
  stay: StaySpan,
  item: { placeId?: string; latitude?: number; longitude?: number },
): void => {
  if (stay.placeId || !item.placeId) return;
  stay.placeId = item.placeId;
  if (typeof item.latitude === 'number' && Number.isFinite(item.latitude)
    && typeof item.longitude === 'number' && Number.isFinite(item.longitude)) {
    stay.latitude = item.latitude;
    stay.longitude = item.longitude;
  }
};

const CHECK_IN_PREFIX = '入住 ';
const CHECK_OUT_PREFIX = '退房 ';

/**
 * Reconstructs each stay from the itinerary items it became.
 *
 * The span is not stored anywhere: a stay exists as a check-in item on one day
 * and a check-out item on another, and those are what sync. Pairing them back
 * up by property name is what lets every night in between know where the
 * traveller is sleeping — the days between check-in and check-out otherwise
 * say nothing at all, which is most of a trip.
 *
 * Pairing on the name rather than on an id kept alongside is deliberate: the
 * items already carry the name, so this needs no new column and works on
 * bookings entered before this existed.
 */
export const staysFromItinerary = (
  items: Array<{ id: string; type: string; title: string; date?: string; address?: string; location?: string; fixedEventKind?: string; placeId?: string; latitude?: number; longitude?: number }>,
): StaySpan[] => {
  const byName = new Map<string, StaySpan>();

  const ensure = (name: string, itemId: string): StaySpan => {
    const existing = byName.get(name);
    if (existing) return existing;
    const created: StaySpan = { name, nights: [], itemId };
    byName.set(name, created);
    return created;
  };

  for (const item of items) {
    if (item.type !== 'HOTEL' || item.fixedEventKind !== 'accommodation') continue;

    if (item.title.startsWith(CHECK_IN_PREFIX)) {
      const stay = ensure(item.title.slice(CHECK_IN_PREFIX.length), item.id);
      stay.checkInDate = item.date;
      stay.address = stay.address ?? item.address ?? item.location;
      carryPlace(stay, item);
      // The check-in item is the one worth opening, so it wins the id.
      stay.itemId = item.id;
    } else if (item.title.startsWith(CHECK_OUT_PREFIX)) {
      const stay = ensure(item.title.slice(CHECK_OUT_PREFIX.length), item.id);
      stay.checkOutDate = item.date;
      stay.address = stay.address ?? item.address ?? item.location;
      carryPlace(stay, item);
    } else {
      // A stay entered with no dates keeps its bare title.
      const stay = ensure(item.title, item.id);
      stay.address = stay.address ?? item.address ?? item.location;
      carryPlace(stay, item);
    }
  }

  for (const stay of byName.values()) {
    stay.nights = stayNights({ hotelName: stay.name, checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate });
  }
  return [...byName.values()];
};

/**
 * Where the traveller sleeps on a given night.
 *
 * The check-out morning is not a night here: they are leaving, and saying
 * 「住宿」 on the day they hand the key back would be telling them they have a
 * room they no longer have.
 */
export const stayForNight = (stays: StaySpan[], date: string): StaySpan | undefined =>
  date ? stays.find(stay => stay.nights.includes(date)) : undefined;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * The stay's dates as one line: 10/02（五）– 10/04（日）· 2 晚.
 *
 * Built from the local calendar rather than a locale formatter so the weekday
 * matches the day tab beside it. A date read in UTC is a day out east of
 * Greenwich, which is the bug this project has already paid for once.
 */
export const formatStayDates = (stay: Pick<StaySpan, 'checkInDate' | 'checkOutDate' | 'nights'>): string => {
  const label = (iso?: string) => {
    if (!iso) return '';
    const date = fromLocalIsoDate(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${iso.slice(5).replace('-', '/')}（${WEEKDAYS[date.getDay()]}）`;
  };

  const checkIn = label(stay.checkInDate);
  const checkOut = label(stay.checkOutDate);
  const nights = stay.nights.length;

  if (checkIn && checkOut) {
    return nights > 0 ? `${checkIn} – ${checkOut} · ${nights} 晚` : `${checkIn} – ${checkOut}`;
  }
  if (checkIn) return `${checkIn} 入住`;
  if (checkOut) return `${checkOut} 退房`;
  return '尚未設定日期';
};

/**
 * A maps link for a place, preferring the one Google resolved.
 *
 * The address fallback is a search rather than a pin: an address string can be
 * ambiguous, and dropping a pin on the wrong 上野 is worse than handing the
 * traveller a search they can see the results of.
 */
export const stayMapUrl = (stay: { name: string; address?: string; mapsUri?: string }): string => {
  if (stay.mapsUri) return stay.mapsUri;
  const query = [stay.name, stay.address].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};
