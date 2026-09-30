/**
 * Getting from the plane to the room.
 *
 * Landing is not arriving. Between the two there is immigration, baggage,
 * customs, and a ride that can be twenty minutes or ninety depending on the
 * city — and a check-in card sitting at a flat 15:00 tells the traveller
 * nothing about any of it.
 *
 * This turns a landing time and a hotel into the two things they need on the
 * itinerary: when they will realistically leave the airport, and how long the
 * journey to the hotel takes.
 */

export interface ArrivalPlan {
  /** Seconds from the airport to the hotel, when a route was found. */
  travelSeconds?: number;
  distanceMeters?: number;
  /** How that journey is made. Korea has no driving data, only transit. */
  mode?: 'DRIVE' | 'TRANSIT';
  hotelLatitude?: number;
  hotelLongitude?: number;
}

/**
 * Minutes between the wheels touching down and walking out of the terminal.
 *
 * Two hours covers immigration and customs on an international arrival. It is
 * a deliberate over-estimate: being early at a hotel costs nothing, and a
 * plan that assumes a fast queue falls apart on the one day it is slow.
 */
export const MINUTES_CLEARING_AIRPORT = 120;

const clampToDay = (minutes: number) => Math.min(23 * 60 + 59, Math.max(0, minutes));

const toMinutes = (time: string): number | null => {
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const toClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * When the traveller can be expected to leave the airport.
 *
 * Clamped inside the arrival day rather than rolling over: a near-midnight
 * landing means leaving that night, and pushing the card to the next date
 * would take it off the day they actually land on.
 */
export const departAirportTime = (arrivalTime: string): string | null => {
  const minutes = toMinutes(arrivalTime);
  return minutes === null ? null : toClock(clampToDay(minutes + MINUTES_CLEARING_AIRPORT));
};

/**
 * When they reach the hotel: out of the airport, plus the journey.
 *
 * Without a route this is just the airport-exit time. Adding a guessed
 * journey would move check-in by an amount nobody could check.
 */
export const reachHotelTime = (arrivalTime: string, travelSeconds?: number): string | null => {
  const departure = departAirportTime(arrivalTime);
  if (departure === null) return null;
  if (!travelSeconds || travelSeconds <= 0) return departure;
  const minutes = toMinutes(departure);
  return minutes === null ? departure : toClock(clampToDay(minutes + Math.round(travelSeconds / 60)));
};

/**
 * A duration a traveller reads at a glance: 1 小時 25 分, or 45 分.
 *
 * Rounded to the minute because a route estimate is not accurate to the
 * second, and printing one would claim a precision it does not have.
 */
export const formatTravelDuration = (seconds: number): string => {
  const total = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} 分`;
  return minutes === 0 ? `${hours} 小時` : `${hours} 小時 ${minutes} 分`;
};

/**
 * The transport card for the ride in.
 *
 * Not marked fixed: a recommendation is a starting point, and the traveller
 * may take a different train, share a taxi, or stop for food on the way.
 */
export const airportTransferItem = (
  options: {
    id: string;
    date: string;
    departTime: string;
    airportName: string;
    hotelName: string;
    travelSeconds?: number;
    mode?: 'DRIVE' | 'TRANSIT';
  },
): {
  id: string;
  type: 'TRANSPORT';
  title: string;
  location: string;
  notes: string;
  date: string;
  time: string;
} => ({
  id: options.id,
  type: 'TRANSPORT',
  title: `前往 ${options.hotelName}`,
  location: `${options.airportName} → ${options.hotelName}`,
  // Named by the mode that produced it. Calling a 78-minute transit journey
  // 車程 would have the traveller looking for a taxi that does not exist.
  notes: options.travelSeconds
    ? `${options.mode === 'TRANSIT' ? '大眾運輸' : '車程'}約 ${formatTravelDuration(options.travelSeconds)}，已含入境與提領行李約 ${MINUTES_CLEARING_AIRPORT / 60} 小時`
    : `已含入境與提領行李約 ${MINUTES_CLEARING_AIRPORT / 60} 小時，交通時間請再確認`,
  date: options.date,
  time: options.departTime,
});
