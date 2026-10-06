/**
 * What to do when the model provider fails.
 *
 * 「他剛說無法解析」. The receipt route answered 502 on a photo that parses
 * perfectly well: `gemini-3-flash-preview` returned `fetch failed` and
 * `gemini-3.5-flash` returned 503 高需求. Neither is a fault in the image, and
 * both had an answer available one model down the list — but the fall-through
 * only moved on for a quota error, and a bare network failure was not even
 * retried, because it arrives with no status and no code at all.
 *
 * Two separate questions, kept separate:
 *   - is another attempt at *this* model worth making?
 *   - is another *model* worth trying?
 *
 * The second used to be answered 「only when out of quota」, which is why an
 * overloaded model ended the request instead of stepping aside.
 */

const textOf = (error: unknown): string => {
  if (!error || typeof error !== 'object') return typeof error === 'string' ? error : '';
  const candidate = error as { message?: unknown; cause?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const cause = candidate.cause && typeof candidate.cause === 'object'
    ? String((candidate.cause as { message?: unknown }).message ?? '')
    : '';
  return `${message} ${cause}`;
};

const statusValues = (error: unknown): unknown[] => {
  if (!error || typeof error !== 'object') return [];
  const candidate = error as { status?: unknown; code?: unknown };
  return [candidate.status, candidate.code];
};

/** Out of quota, in any of the shapes the SDK reports it. */
export const isQuotaError = (error: unknown): boolean => {
  for (const value of statusValues(error)) {
    if (value === 429 || value === '429') return true;
    if (typeof value === 'string' && /RESOURCE_EXHAUSTED/i.test(value)) return true;
  }
  return /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(textOf(error));
};

/**
 * The provider could not be reached at all.
 *
 * `fetch failed` is what a dropped connection, a DNS blip or a timed-out TLS
 * handshake looks like from here: no status, no code, three words. It was
 * reaching the caller as a permanent failure, so a transient network fault
 * became 「無法辨識收據」 on somebody's phone.
 */
export const isNetworkError = (error: unknown): boolean =>
  /fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up|aborted/i.test(textOf(error));

/** Busy, overloaded, or briefly broken on the provider's side. */
export const isOverloadedError = (error: unknown): boolean => {
  for (const value of statusValues(error)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 500 && numeric < 600) return true;
    if (typeof value === 'string' && /UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED/i.test(value)) return true;
  }
  return /\b(500|502|503|504)\b|unavailable|internal error|overloaded|high demand|timed? ?out|try again/i
    .test(textOf(error));
};

/**
 * Whether another attempt at the same model could plausibly succeed.
 *
 * Deliberately broad. Retrying a permanent error costs two seconds; refusing
 * to retry a transient one costs the feature.
 */
export const isRetryableProviderError = (error: unknown): boolean =>
  isQuotaError(error) || isOverloadedError(error) || isNetworkError(error);

/**
 * Whether the next model in the list is worth trying.
 *
 * Quota is metered per model, so a different model is a different allowance —
 * that was the original reason for the list. Load and reachability are per
 * model too: 「This model is currently experiencing high demand」 is a statement
 * about one model, and the next one answered the same receipt immediately.
 *
 * A malformed request is not in this set. That fails identically on every
 * model, and walking the whole list would turn one clear error into four slow
 * ones.
 */
export const shouldTryNextModel = (error: unknown): boolean =>
  isQuotaError(error) || isOverloadedError(error) || isNetworkError(error);
