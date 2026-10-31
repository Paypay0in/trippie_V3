import type { SupportedLanguage } from '../i18n/config';

/**
 * The interface language, told to the server on every API call.
 *
 * Why a wrapper around `fetch` and not an argument on each request: there are
 * about thirty places in this app that call `/api/...`, and the language is
 * needed by all of them for the same reason. Threading a parameter through
 * thirty call sites is the defect shape this codebase keeps producing — one
 * rule with many homes, where the day somebody adds the thirty-first the
 * server silently falls back to Chinese for an English reader. One home, and
 * a new endpoint is correct without anybody remembering anything.
 *
 * Only same-origin `/api/` requests are touched. Google, Render and anything
 * else see the request exactly as before: a header invented here means
 * nothing to them, and sending the traveller's interface language to third
 * parties is not something this function is for.
 */
export const API_LANGUAGE_HEADER = 'x-trippie-language';

type FetchLike = typeof fetch;

const isSameOriginApiCall = (input: RequestInfo | URL): boolean => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!url) return false;
  if (url.startsWith('/api/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    const resolved = new URL(url, window.location.href);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

/**
 * Wraps `fetch` so API calls carry the current interface language.
 *
 * `getLanguage` is read per request, not once at install time: the traveller
 * can change the language in 設定 without reloading, and a value captured at
 * startup would keep answering in the language they just left.
 *
 * Returns the previous `fetch`, so a test can put it back.
 */
export const installApiLanguageHeader = (
  getLanguage: () => SupportedLanguage,
  target: { fetch: FetchLike } = globalThis as unknown as { fetch: FetchLike },
): FetchLike => {
  const original = target.fetch;

  const wrapped: FetchLike = (input, init) => {
    if (!isSameOriginApiCall(input)) return original(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(API_LANGUAGE_HEADER, getLanguage());
    return original(input, { ...init, headers });
  };

  target.fetch = wrapped;
  return original;
};
