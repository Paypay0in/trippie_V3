import { Category, PaymentMethod } from '../types';

/**
 * The one place a stored category or payment-method value is turned into words.
 *
 * The enum values are not labels. `Category.FLIGHT = '機票'` is the string
 * written to localStorage and pushed to Supabase on every expense anybody has
 * ever recorded (`tripSyncMapping.ts` writes it and reads it straight back), so
 * translating the enum would not translate history — it would orphan it. The
 * stored value therefore never changes, in any language, and English is a
 * display-only lookup keyed on that stored value.
 *
 * It is also why this table has exactly one home. `WalletPreScreen` used to
 * keep its own six-entry copy and answered 簽證／入境費, 旅遊保險 and
 * 伴手禮／購物 while every other expense screen answered the stored string —
 * the same label with two spellings, which is the same label with two answers.
 * The canonical zh-Hant label is the stored string itself (Founder, 2026-10-30).
 */
export type DisplayLocale = 'zh-Hant' | 'en';

type StoredValue = Category | PaymentMethod;

/**
 * English display labels, keyed on the immutable stored value.
 *
 * Deliberately keyed on the value and not the enum member name: the value is
 * what a persisted row carries, so a row written years ago still finds its
 * label here without a migration.
 */
const EN_LABELS: Record<string, string> = {
  [Category.FLIGHT]: 'Flights',
  [Category.ACCOMMODATION]: 'Accommodation',
  [Category.VISA]: 'Visa',
  [Category.INSURANCE]: 'Insurance',
  [Category.SIM_WIFI]: 'SIM / Wi-Fi',
  [Category.TRANSPORT_AIRPORT]: 'Airport transfer',
  [Category.SHOPPING_PRE]: 'Pre-trip shopping',
  [Category.EXCHANGE]: 'Currency exchange',
  [Category.SHOPPING]: 'Shopping',
  [Category.FOOD]: 'Food & drink',
  [Category.SOUVENIR]: 'Souvenirs',
  [Category.TRANSPORT]: 'Transport',
  [Category.TICKET]: 'Tickets',
  [Category.HELP_BUY]: 'Buying for a friend',
  [Category.COSMETICS]: 'Beauty & skincare',
  [Category.ELECTRONICS]: 'Electronics',
  [Category.FASHION]: 'Fashion',
  [Category.ACCESSORIES]: 'Accessories',
  [Category.TRANSPORT_POST]: 'Transport home',
  [Category.OTHER]: 'Other',
  [PaymentMethod.CREDIT_CARD]: 'Credit card',
  [PaymentMethod.CASH_TWD]: 'TWD cash',
  [PaymentMethod.CASH_FOREIGN]: 'Foreign cash',
  [PaymentMethod.IC_CARD]: 'Transit card',
};

/** Every stored value this module is responsible for naming. */
export const STORED_DISPLAY_VALUES: readonly string[] = Object.freeze([
  ...Object.values(Category),
  ...Object.values(PaymentMethod),
]);

/**
 * How a stored value is shown. An unknown value is shown as itself rather than
 * blanked: a row written by a newer build still reads as something.
 */
export const displayLabel = (stored: StoredValue | string, locale: DisplayLocale = 'zh-Hant'): string => {
  const value = String(stored);
  if (locale === 'en') return EN_LABELS[value] ?? value;
  return value;
};

export const categoryLabel = (category: Category | string, locale: DisplayLocale = 'zh-Hant'): string =>
  displayLabel(category, locale);

export const paymentMethodLabel = (method: PaymentMethod | string, locale: DisplayLocale = 'zh-Hant'): string =>
  displayLabel(method, locale);
