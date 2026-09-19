/**
 * Language setup.
 *
 * The app follows the device rather than asking. Someone who has already told
 * their phone what language they read should not have to tell a travel app the
 * same thing, and a language picker buried in settings is a question most
 * travellers never find.
 *
 * Traditional Chinese is the fallback, not English. Every string in this
 * product was written in Chinese first, and strings are being moved into
 * translation files a screen at a time — so a key that has not been translated
 * yet resolves to the Chinese the screen already showed, never to a raw
 * `plan.title` leaking onto someone's screen mid-migration.
 */
import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhHant from './locales/zh-Hant.json';
import en from './locales/en.json';

export const FALLBACK_LANGUAGE = 'zh-Hant';

export const SUPPORTED_LANGUAGES = ['zh-Hant', 'en'] as const;
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

  // Anything else — including Simplified Chinese, Japanese and Korean — gets
  // English, which is the closest thing to a shared language we ship today.
  return 'en';
};

/**
 * `?lang=en` — a way to look at a language that is not the device's.
 *
 * There is no language setting in the product and there should not be: the
 * device already knows. But reviewing translation work by changing the whole
 * browser's language and restarting it, once per screen, is slow enough that
 * screens do not get reviewed. This makes that a URL.
 *
 * It is a preview, not a preference: nothing is stored, so closing the tab
 * puts the reader back on their own language.
 */
export const languageFromUrl = (search?: string): SupportedLanguage | undefined => {
  const source = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const requested = new URLSearchParams(source).get('lang');
  if (!requested) return undefined;
  return resolveLanguage(requested);
};

export const initI18n = (options: { language?: string } = {}): I18nInstance => {
  if (i18next.isInitialized) return i18next;

  const instance = i18next.use(initReactI18next);
  // The detector reads the device; a caller that passes an explicit language
  // (tests, and the server when it renders for a known user) skips it entirely
  // so the result never depends on the environment it happens to run in.
  if (!options.language) instance.use(LanguageDetector);

  instance.init({
    resources: {
      'zh-Hant': { translation: zhHant },
      en: { translation: en },
    },
    lng: options.language ? resolveLanguage(options.language) : undefined,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    // `zh-TW` should load the `zh-Hant` bundle rather than miss and fall back.
    load: 'currentOnly',
    detection: {
      order: ['navigator', 'htmlTag'],
      // No cache: the device is the source of truth. Remembering a language
      // chosen by a previous detection would mean a traveller who changes their
      // phone's language keeps seeing the old one.
      caches: [],
      convertDetectedLanguage: resolveLanguage,
    },
    interpolation: {
      // React escapes for us; escaping twice turns 「」 and & into entities.
      escapeValue: false,
    },
    returnEmptyString: false,
  });

  return i18next;
};

export default i18next;
