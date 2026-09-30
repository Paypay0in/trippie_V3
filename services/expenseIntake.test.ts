import { describe, expect, it } from 'vitest';
import { Category, PaymentMethod } from '../types';
import {
  extractExchangeRate,
  isCurrencyCode,
  isSupportedImageMime,
  normalizeParsedExpense,
  rateFromFxResponse,
  resolveImageMime,
} from './expenseIntake';

describe('normalizeParsedExpense', () => {
  it('keeps a well-formed result intact', () => {
    expect(normalizeParsedExpense({
      description: '海雲台烤貝',
      amount: 38000,
      currency: 'krw',
      category: Category.FOOD,
      paymentMethod: PaymentMethod.CASH_FOREIGN,
      date: '2026-10-03',
      country: '韓國',
    })).toEqual({
      description: '海雲台烤貝',
      amount: 38000,
      currency: 'KRW',
      category: Category.FOOD,
      paymentMethod: PaymentMethod.CASH_FOREIGN,
      date: '2026-10-03',
      country: '韓國',
    });
  });

  it('refuses a result with no amount, because there is nothing to apply', () => {
    expect(normalizeParsedExpense({ description: '午餐', currency: 'KRW' })).toBeNull();
    expect(normalizeParsedExpense({ amount: 0, currency: 'KRW' })).toBeNull();
    expect(normalizeParsedExpense({ amount: -500 })).toBeNull();
    expect(normalizeParsedExpense(null)).toBeNull();
    expect(normalizeParsedExpense('{"amount":1}')).toBeNull();
  });

  it('drops a category the ledger does not have rather than inventing one', () => {
    const result = normalizeParsedExpense({ amount: 100, category: '宵夜' });
    expect(result?.amount).toBe(100);
    expect(result?.category).toBeUndefined();
  });

  it('drops a payment method outside the enum', () => {
    expect(normalizeParsedExpense({ amount: 100, paymentMethod: 'Apple Pay' })?.paymentMethod).toBeUndefined();
  });

  it('drops a currency that is prose rather than a code', () => {
    expect(normalizeParsedExpense({ amount: 100, currency: 'Korean Won' })?.currency).toBeUndefined();
    expect(normalizeParsedExpense({ amount: 100, currency: 'krw' })?.currency).toBe('KRW');
  });

  it('drops dates that are not ISO, so the ledger never files a receipt under a guess', () => {
    const result = normalizeParsedExpense({
      amount: 100,
      date: '3 Oct 2026',
      travelStartDate: '2026-10-02',
      travelEndDate: '',
    });
    expect(result?.date).toBeUndefined();
    expect(result?.travelStartDate).toBe('2026-10-02');
    expect(result?.travelEndDate).toBeUndefined();
  });

  it('accepts a numeric string amount, which the model sometimes returns', () => {
    expect(normalizeParsedExpense({ amount: '12000' })?.amount).toBe(12000);
  });

  it('only carries isUncertain when it is genuinely true', () => {
    expect(normalizeParsedExpense({ amount: 1, isUncertain: 'yes' })?.isUncertain).toBeUndefined();
    expect(normalizeParsedExpense({ amount: 1, isUncertain: true })?.isUncertain).toBe(true);
  });
});

describe('extractExchangeRate', () => {
  it('digs the number out of a sentence', () => {
    expect(extractExchangeRate('The rate is 0.0238 TWD per KRW')).toBeCloseTo(0.0238);
    expect(extractExchangeRate('0.024')).toBeCloseTo(0.024);
  });

  it('rejects a rate that would silently corrupt every converted amount', () => {
    expect(extractExchangeRate('0')).toBeNull();
    expect(extractExchangeRate('about 999999')).toBeNull();
    expect(extractExchangeRate('no rate available')).toBeNull();
    expect(extractExchangeRate(undefined)).toBeNull();
  });
});

describe('input guards', () => {
  it('accepts only ISO 4217 shapes', () => {
    expect(isCurrencyCode('KRW')).toBe(true);
    expect(isCurrencyCode('krw')).toBe(true);
    expect(isCurrencyCode('WON')).toBe(true);
    expect(isCurrencyCode('KR')).toBe(false);
    expect(isCurrencyCode('')).toBe(false);
    expect(isCurrencyCode(42)).toBe(false);
  });

  it('accepts only the image types a phone camera produces', () => {
    expect(isSupportedImageMime('image/jpeg')).toBe(true);
    expect(isSupportedImageMime('image/heic')).toBe(true);
    expect(isSupportedImageMime('application/pdf')).toBe(false);
    expect(isSupportedImageMime('text/html')).toBe(false);
    expect(isSupportedImageMime(undefined)).toBe(false);
  });
});

describe('rateFromFxResponse', () => {
  const ok = { result: 'success', rates: { TWD: 0.023516, USD: 0.00071 } };

  it('reads the requested currency', () => {
    expect(rateFromFxResponse(ok, 'TWD')).toBeCloseTo(0.023516);
    expect(rateFromFxResponse(ok, 'USD')).toBeCloseTo(0.00071);
  });

  it('returns null when the currency is absent, so the caller falls back', () => {
    expect(rateFromFxResponse(ok, 'JPY')).toBeNull();
  });

  it('refuses a payload the provider did not mark successful', () => {
    expect(rateFromFxResponse({ result: 'error', rates: { TWD: 0.02 } }, 'TWD')).toBeNull();
    expect(rateFromFxResponse({ rates: { TWD: 0.02 } }, 'TWD')).toBeNull();
    expect(rateFromFxResponse(null, 'TWD')).toBeNull();
    expect(rateFromFxResponse('0.02', 'TWD')).toBeNull();
  });

  it('refuses a rate that is not a usable positive number', () => {
    expect(rateFromFxResponse({ result: 'success', rates: { TWD: 0 } }, 'TWD')).toBeNull();
    expect(rateFromFxResponse({ result: 'success', rates: { TWD: '0.02' } }, 'TWD')).toBeNull();
  });
});

describe('resolveImageMime — what an actual phone sends', () => {
  // Real leading bytes, base64-encoded.
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD';
  const WEBP = 'UklGRiIAAABXRUJQVlA4';

  it('trusts the bytes over whatever the browser claimed', () => {
    expect(resolveImageMime('image/png', PNG)).toBe('image/png');
    expect(resolveImageMime('image/jpeg', JPEG)).toBe('image/jpeg');
    expect(resolveImageMime('image/webp', WEBP)).toBe('image/webp');
    // A browser that mislabels a PNG as JPEG must not make us mislabel it too.
    expect(resolveImageMime('image/jpeg', PNG)).toBe('image/png');
  });

  it('accepts an empty type, which iOS sends often enough to matter', () => {
    // This was refused with 「需要一張截圖」 while holding a perfectly good photo.
    expect(resolveImageMime('', PNG)).toBe('image/png');
    expect(resolveImageMime(undefined, JPEG)).toBe('image/jpeg');
  });

  it('accepts a type carrying parameters', () => {
    expect(resolveImageMime('image/jpeg; charset=utf-8', 'unknownbytes')).toBe('image/jpeg');
    expect(resolveImageMime('IMAGE/PNG', 'unknownbytes')).toBe('image/png');
  });

  it('treats image/jpg as the jpeg it means', () => {
    expect(resolveImageMime('image/jpg', 'unknownbytes')).toBe('image/jpeg');
  });

  it('still refuses what is genuinely not an image', () => {
    expect(resolveImageMime('application/pdf', 'JVBERi0xLjQK')).toBeNull();
    expect(resolveImageMime('text/html', 'PGh0bWw+')).toBeNull();
    expect(resolveImageMime('', 'not-an-image-at-all')).toBeNull();
    expect(resolveImageMime(42, 'unknownbytes')).toBeNull();
  });
});
