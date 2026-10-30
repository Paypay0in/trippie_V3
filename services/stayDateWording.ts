/**
 * The one line a stay's dates are written as: 10/02（五）– 10/04（日）· 2 晚.
 *
 * Split out of `stayIntake.ts` for one reason: `server.ts` imports that module
 * (`normalizeParsedStay`, `stayPrompt`), and translating a sentence needs
 * `i18n/config`, which pulls in react-i18next and a browser language detector.
 * Neither belongs in the server runtime, and a module-level import reaches it
 * whether the server calls that function or not. So the wording lives here,
 * where only the browser looks, and the parsing stays there.
 *
 * Built from the local calendar rather than a locale date formatter so the
 * weekday matches the day tab beside it. A date read as UTC is a day out east
 * of Greenwich, which is a bug this project has already paid for once.
 */
import i18n from '../i18n/config';
import { fromLocalIsoDate } from './localDate';
import type { StaySpan } from './stayIntake';

/**
 * `10/02（五）`, or an empty string for a date that is missing or unreadable.
 *
 * The weekday comes from the bundles rather than a hardcoded table, because
 * the parenthesised Chinese form and the English short name are different
 * typography, not just different words.
 */
const dayLabel = (iso?: string): string => {
  if (!iso) return '';
  const date = fromLocalIsoDate(iso);
  if (Number.isNaN(date.getTime())) return '';
  return i18n.t('stay.dates.day', {
    date: iso.slice(5).replace('-', '/'),
    weekday: i18n.t(`dates.weekday.${date.getDay()}`),
  });
};

export const formatStayDates = (
  stay: Pick<StaySpan, 'checkInDate' | 'checkOutDate' | 'nights'>,
): string => {
  const checkIn = dayLabel(stay.checkInDate);
  const checkOut = dayLabel(stay.checkOutDate);
  const nights = stay.nights.length;

  if (checkIn && checkOut) {
    return nights > 0
      ? i18n.t('stay.dates.rangeWithNights', { checkIn, checkOut, n: nights })
      : i18n.t('stay.dates.range', { checkIn, checkOut });
  }
  if (checkIn) return i18n.t('stay.dates.checkInOnly', { date: checkIn });
  if (checkOut) return i18n.t('stay.dates.checkOutOnly', { date: checkOut });
  return i18n.t('stay.dates.unset');
};
