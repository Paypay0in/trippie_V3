import { describe, expect, it } from 'vitest';
import {
  isNetworkError,
  isOverloadedError,
  isQuotaError,
  isRetryableProviderError,
  shouldTryNextModel,
} from './providerFailure';

/**
 * 「他剛說無法解析」.
 *
 * The receipt route answered 502 on a photo that parses perfectly well. The
 * two failures behind it, taken from the live run: `gemini-3-flash-preview`
 * threw `fetch failed`, and `gemini-3.5-flash` returned 503 「This model is
 * currently experiencing high demand」.
 */
const FETCH_FAILED = Object.assign(new Error('fetch failed'), {});
const HIGH_DEMAND = Object.assign(
  new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'),
  { status: 503 },
);
const OUT_OF_QUOTA = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
const BAD_REQUEST = Object.assign(new Error('Invalid JSON payload received.'), { status: 400 });

describe('what kind of failure this is', () => {
  it('recognises a quota failure in each shape the SDK reports it', () => {
    expect(isQuotaError(OUT_OF_QUOTA)).toBe(true);
    expect(isQuotaError({ code: '429' })).toBe(true);
    expect(isQuotaError(new Error('You exceeded your current quota'))).toBe(true);
    expect(isQuotaError(BAD_REQUEST)).toBe(false);
  });

  it('recognises an overloaded model', () => {
    expect(isOverloadedError(HIGH_DEMAND)).toBe(true);
    expect(isOverloadedError({ status: 'UNAVAILABLE' })).toBe(true);
    expect(isOverloadedError(BAD_REQUEST)).toBe(false);
  });

  it('recognises a provider that could not be reached at all', () => {
    // Three words, no status, no code — and it was reaching the caller as a
    // permanent failure.
    expect(isNetworkError(FETCH_FAILED)).toBe(true);
    expect(isNetworkError(new Error('socket hang up'))).toBe(true);
    expect(isNetworkError(Object.assign(new Error('request failed'), { cause: new Error('ECONNRESET') }))).toBe(true);
    expect(isNetworkError(BAD_REQUEST)).toBe(false);
  });
});

describe('whether to try again', () => {
  it('retries a network failure, which it previously did not', () => {
    expect(isRetryableProviderError(FETCH_FAILED)).toBe(true);
  });

  it('retries quota and overload', () => {
    expect(isRetryableProviderError(OUT_OF_QUOTA)).toBe(true);
    expect(isRetryableProviderError(HIGH_DEMAND)).toBe(true);
  });

  it('does not retry a malformed request', () => {
    // It fails identically however many times it is sent.
    expect(isRetryableProviderError(BAD_REQUEST)).toBe(false);
  });
});

describe('whether to try the next model', () => {
  it('steps aside for an overloaded model', () => {
    // The whole failure: this used to be false, so an overloaded model ended
    // the request while three untouched models sat below it in the list.
    expect(shouldTryNextModel(HIGH_DEMAND)).toBe(true);
  });

  it('steps aside for one that could not be reached', () => {
    expect(shouldTryNextModel(FETCH_FAILED)).toBe(true);
  });

  it('still steps aside when out of quota', () => {
    expect(shouldTryNextModel(OUT_OF_QUOTA)).toBe(true);
  });

  it('stops on a malformed request rather than walking the whole list', () => {
    // Four slow failures instead of one clear one helps nobody.
    expect(shouldTryNextModel(BAD_REQUEST)).toBe(false);
  });
});
