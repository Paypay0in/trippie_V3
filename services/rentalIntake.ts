/**
 * Reading a car hire off a confirmation.
 *
 * 「可以在安排行程那加上租車訂單等 啥的 讓用戶可以上傳資訊」.
 *
 * And it answers the question that came before it. 「是租兩天的車等 但旅行有五天
 * 因此先不要直接預設交通馬上排用租車」 — a trip's brief can say a car exists,
 * but not which days. The confirmation can: it has a pickup and a drop-off,
 * and those two moments are the answer.
 *
 * So a hire is a span, never a flag. `rentalDays` turns it into the days the
 * traveller actually has the keys, which is what a planner should ask about —
 * rather than treating five days as drivable because two of them are.
 */

export const RENTAL_MODEL = 'gemini-3-flash-preview';

export interface ParsedRental {
  /** The hire company as printed: Toyota Rent a Car, Hertz, OTS. */
  company: string;
  pickUpDate?: string;
  pickUpTime?: string;
  dropOffDate?: string;
  dropOffTime?: string;
  pickUpLocation?: string;
  /** Only when the confirmation says it differs from the pickup. */
  dropOffLocation?: string;
  carDescription?: string;
  confirmationNumber?: string;
  driverName?: string;
  /** The booking's own total, only when the confirmation states one. */
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
 * A hire that cannot name the company is not one we can file.
 *
 * The same refusal `stayIntake` makes for a hotel with no name: an empty form
 * the traveller fills in is recoverable, a confidently wrong record is not.
 */
export const normalizeParsedRental = (raw: unknown): ParsedRental | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  const company = typeof value.company === 'string' ? value.company.trim().slice(0, 120) : '';
  if (!company) return null;

  const rental: ParsedRental = { company };

  for (const field of ['pickUpDate', 'dropOffDate'] as const) {
    const date = value[field];
    if (typeof date === 'string' && ISO_DATE.test(date.trim())) rental[field] = date.trim();
  }
  // Returned before collected is a misread, not a hire that ran backwards.
  if (rental.pickUpDate && rental.dropOffDate && rental.dropOffDate < rental.pickUpDate) {
    delete rental.dropOffDate;
    rental.isUncertain = true;
  }

  const pickUpTime = cleanTime(value.pickUpTime);
  if (pickUpTime) rental.pickUpTime = pickUpTime;
  const dropOffTime = cleanTime(value.dropOffTime);
  if (dropOffTime) rental.dropOffTime = dropOffTime;

  for (const field of ['pickUpLocation', 'dropOffLocation', 'carDescription',
    'confirmationNumber', 'driverName'] as const) {
    const text = value[field];
    if (typeof text === 'string' && text.trim()) rental[field] = text.trim().slice(0, 200);
  }
  // One branch, said once: a drop-off repeating the pickup is not information.
  if (rental.dropOffLocation && rental.dropOffLocation === rental.pickUpLocation) {
    delete rental.dropOffLocation;
  }

  const total = typeof value.totalAmount === 'number' ? value.totalAmount : Number(value.totalAmount);
  if (Number.isFinite(total) && total > 0) rental.totalAmount = total;

  if (typeof value.currency === 'string') {
    const currency = value.currency.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(currency)) rental.currency = currency;
  }
  // An amount with no currency is a number nobody can act on.
  if (rental.totalAmount !== undefined && !rental.currency) delete rental.totalAmount;

  if (value.isUncertain === true) rental.isUncertain = true;

  return rental;
};

/**
 * The days the traveller has the keys, inclusive of both ends.
 *
 * Both ends count and that is the point: a car collected at 10:00 on the 3rd
 * and returned at 18:00 on the 5th is drivable on the 3rd, 4th and 5th. The
 * hours are not modelled — a planner asking 「這幾天要安排自駕嗎」 needs the
 * days, and pretending to know whether 09:00 on the 5th is before the return
 * would be precision this data does not have.
 *
 * Nothing without both dates. A half-known hire is exactly the case where
 * guessing the other end puts a car on days nobody said it was there.
 */
export const rentalDays = (rental: Pick<ParsedRental, 'pickUpDate' | 'dropOffDate'>): string[] => {
  const { pickUpDate, dropOffDate } = rental;
  if (!pickUpDate || !dropOffDate) return [];
  const start = Date.parse(`${pickUpDate}T00:00:00Z`);
  const end = Date.parse(`${dropOffDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];

  const days: string[] = [];
  for (let time = start; time <= end; time += 86400000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
};

/** Whether this day is one the traveller can drive. */
export const hasCarOn = (rentals: ParsedRental[], date: string): boolean =>
  rentals.some(rental => rentalDays(rental).includes(date));

/*
  `formatRentalSpan` lives in `services/rentalSpanWording.ts`. It is the only
  part of a hire that is words, and `server.ts` imports this module — see that
  file's note and `tests/serverNeverImportsBrowserI18n.test.ts`.
*/

export const rentalPrompt = () => `
      Analyze this image. It is a car hire confirmation — from a rental
      company, a booking site, or an email.

      Extract:
      1. "company": the rental company as printed, e.g. "Toyota Rent a Car",
         "OTS レンタカー", "Hertz".
      2. "pickUpDate" (YYYY-MM-DD) and "pickUpTime" (HH:mm, 24-hour).
      3. "dropOffDate" and "dropOffTime", the same.
      4. "pickUpLocation": the branch or address where the car is collected.
      5. "dropOffLocation": only if it differs from the pickup.
      6. "carDescription": the class or model as written, e.g. "コンパクト",
         "Compact SUV".
      7. "confirmationNumber" and "driverName", if shown.
      8. "totalAmount" and "currency" (ISO code), only if the confirmation
         states a total.

      Rules:
      - Return only what the image shows. Omit anything it does not.
      - Never convert times between timezones; report each as printed.
      - Dates are local to the rental branch.
      - Set "isUncertain" to true if the image is blurry, cropped, or
        ambiguous.
    `;
