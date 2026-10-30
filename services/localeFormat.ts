/**
 * Dates and money, written in the language the reader chose.
 *
 * Four screens called `Intl` and `toLocaleString` with `'zh-TW'` hardcoded, so
 * an English interface still printed `2026年10月2日` and `NT$1,200` in Chinese
 * conventions. It is the quietest kind of half-translation: every word on the
 * screen is English and the numbers still answer in the other language.
 *
 * The locale is read from i18n at call time, never captured at import — the
 * reader can change language while the app is open, and a formatter built once
 * at module scope would keep answering in whichever language loaded first.
 *
 * Place names and anything a traveller typed are not touched by any of this.
 * These functions format values the app computed, not text it was given.
 */
import i18n from '../i18n/config';
import { fromLocalIsoDate } from './localDate';

/**
 * The BCP 47 tag `Intl` should answer in.
 *
 * `zh-Hant` is what the app stores and what i18next reports; `zh-TW` is what
 * `Intl` has the data for, and the two are not interchangeable to it.
 */
const intlLocale = (): string => (i18n.language?.startsWith('zh') ? 'zh-TW' : 'en');

/**
 * A date as the reader's language writes it, or '' for anything unreadable.
 *
 * A bare `YYYY-MM-DD` goes through `fromLocalIsoDate`, not `new Date(...)`.
 * The constructor reads that form as UTC midnight while `Intl` then formats in
 * the local zone, so west of Greenwich every calendar date came out a day
 * early — the bug this project has already paid for once, and which this
 * module reintroduced until its own test said so.
 */
export const formatLocaleDate = (
  value: Date | string | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? (/^\d{4}-\d{2}-\d{2}$/.test(value) ? fromLocalIsoDate(value) : new Date(value))
      : undefined;
  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(intlLocale(), options).format(date);
  } catch {
    return '';
  }
};

/** A plain number, grouped the way the reader's language groups digits. */
export const formatLocaleNumber = (amount: number): string => {
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString(intlLocale());
};

/**
 * An amount in its own currency.
 *
 * Falls back to `CODE 1,200` for a currency `Intl` does not know rather than
 * dropping the number — a price the app cannot style is still a price.
 */
export const formatLocaleCurrency = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${formatLocaleNumber(amount)}`;
  }
};
