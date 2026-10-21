/**
 * The sign a currency is written with, where there is a well-known one.
 *
 * 「¥2,300 / 約 NT$ 506」 — a receipt is read in the money it was printed in,
 * and 「JPY 2,300」 is a database row rather than a price.
 *
 * Falls back to the code and a space. A sign that is guessed is worse than a
 * code that is read: 「$」 alone means a different amount in five countries,
 * which on a screen about money is the one mistake worth avoiding.
 */
const SIGNS: Record<string, string> = {
  TWD: 'NT$',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  USD: 'US$',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  THB: '฿',
  VND: '₫',
  PHP: '₱',
  INR: '₹',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  MYR: 'RM',
  IDR: 'Rp',
};

export const currencySymbol = (currency?: string): string => {
  const code = (currency || '').trim().toUpperCase();
  if (!code) return '';
  return SIGNS[code] ?? `${code} `;
};
