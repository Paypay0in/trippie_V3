/**
 * The one line a car hire's dates are written as: 「10/03 10:00 – 10/05 18:00」.
 *
 * Split out of `rentalIntake.ts` for the reason `stayDateWording` was split out
 * of `stayIntake.ts` and `flightAirportFields` out of `flightAnchorSetup.ts`:
 * `server.ts` imports that module (`normalizeParsedRental`, `rentalPrompt`), and
 * wording the one case a confirmation gives no dates for needs `i18n/config`,
 * which pulls react-i18next and a browser language detector into the server's
 * process whether the server ever calls this function or not.
 * `tests/serverNeverImportsBrowserI18n.test.ts` enforces that, so the words live
 * here, where only the browser looks, and the parsing stays there.
 *
 * Deliberately not a date formatter: the day is printed the way the confirmation
 * prints it, month and day only, because the year is the one part of a hire
 * nobody misreads and the line sits beside a trip that already states it.
 */
import i18n from '../i18n/config';
import type { ParsedRental } from './rentalIntake';

/** 「10/03 10:00 – 10/05 18:00」, or as much of it as the confirmation gave. */
export const formatRentalSpan = (rental: ParsedRental): string => {
  const side = (date?: string, time?: string) => {
    if (!date) return '';
    const day = date.slice(5).replace('-', '/');
    return time ? `${day} ${time}` : day;
  };
  const from = side(rental.pickUpDate, rental.pickUpTime);
  const to = side(rental.dropOffDate, rental.dropOffTime);
  if (from && to) return `${from} – ${to}`;
  return from || to || i18n.t('rental.datesPending');
};
