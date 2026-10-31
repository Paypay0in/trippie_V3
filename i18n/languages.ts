/**
 * Which languages exist, and how a tag becomes one of them.
 *
 * Split out of `i18n/config.ts` so the server can ask the same question the
 * browser asks. `config.ts` pulls in i18next, react-i18next, a language
 * detector and three translation bundles; the server needs none of that to
 * read one request header. The alternative was a second tag matcher on the
 * server, which is this codebase's recurring defect — one rule with two homes,
 * disagreeing the first day somebody adds a language to only one of them.
 *
 * `config.ts` re-exports everything here, so existing imports are unchanged.
 */

export const FALLBACK_LANGUAGE = 'zh-Hant';

export const SUPPORTED_LANGUAGES = ['zh-Hant', 'en', 'ja'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Maps whatever the device reports onto a language we actually ship.
 *
 * Browsers report Chinese in several shapes — `zh-TW`, `zh-Hant`, `zh-HK`,
 * `zh-MO`, and bare `zh` — and a reader of any of them should get the
 * Traditional Chinese build rather than being dropped into English by a string
 * comparison that only knew about one spelling.
 *
 * Simplified Chinese is deliberately not claimed here: it is not shipped yet,
 * and showing Traditional Chinese while pretending it is Simplified would be
 * worse than showing English.
 */
export const resolveLanguage = (requested?: string | null): SupportedLanguage => {
  const tag = (requested || '').trim().toLowerCase();
  if (!tag) return FALLBACK_LANGUAGE;

  if (tag === 'zh' || tag.startsWith('zh-hant') || tag.startsWith('zh-tw')
    || tag.startsWith('zh-hk') || tag.startsWith('zh-mo')) {
    return 'zh-Hant';
  }
  if (tag.startsWith('en')) return 'en';
  if (tag.startsWith('ja')) return 'ja';

  // Anything else — including Simplified Chinese and Korean — gets English,
  // which is the closest thing to a shared language we ship today.
  return 'en';
};
