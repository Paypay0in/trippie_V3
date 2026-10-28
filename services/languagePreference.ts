import {
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  resolveLanguage,
  type SupportedLanguage,
} from '../i18n/config';

/**
 * Which language this phone shows the app in.
 *
 * 「介面的語言隨著手機語言調整，但在「我」的欄位應該要有「設定」可以改」 — so there
 * are two sources and a stated order between them. The device decides, which
 * is right for somebody who has already told their phone what they read and
 * should not have to tell a travel app the same thing. Until they say
 * otherwise: a traveller reading Chinese on an English phone, or the reverse,
 * now has somewhere to say so, and what they say outlives the session.
 *
 * Absence is meaningful here and is not the same as 'zh-Hant'. No stored value
 * means 「follow my phone」, so a traveller who later changes their phone's
 * language gets the app in the new one. A stored 'zh-Hant' means 「Chinese,
 * whatever my phone says」. Collapsing those two into one value would silently
 * pin everybody to whatever language they happened to open the app in first.
 *
 * On the device rather than the account, deliberately and with an honest cost:
 * the preference does not follow you to another phone. `profiles` has no
 * column for it, and the alternative is no setting at all until a migration.
 */

export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'trippie_language_v1';

const isSupported = (value: string): value is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/** The language the traveller chose, or absent when they have not chosen. */
export const loadLanguagePreference = (): SupportedLanguage | undefined => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
  } catch {
    // Private mode, a blocked origin, a full quota: all mean 「no preference」,
    // which hands the decision to the device rather than to an error.
    return undefined;
  }
  if (!raw) return undefined;
  if (isSupported(raw)) return raw;

  /*
    Not a tag we ship. Two ways to get here: somebody edited storage by hand,
    or a release stopped shipping a language stored by an earlier one.

    Regional spellings of a language we DO ship are honoured — 'zh-TW' is a
    stored preference for Chinese, written by a version that kept the device's
    own spelling. Anything else is treated as no preference rather than pushed
    through `resolveLanguage`, which answers English for every unknown tag by
    design: a traveller who never chose English must not be given it by a
    corrupted value.
  */
  const tag = raw.trim().toLowerCase();
  if (tag.startsWith('zh')) return resolveLanguage(raw);
  if (tag.startsWith('en')) return 'en';
  return undefined;
};

export const saveLanguagePreference = (language: SupportedLanguage): void => {
  try {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, language);
  } catch {
    // The choice applies to this session; it simply will not be remembered.
  }
};

/** Hands the decision back to the phone. */
export const clearLanguagePreference = (): void => {
  try {
    localStorage.removeItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
  } catch {
    // Nothing to do: the stored value stays until storage is writable again.
  }
};

/**
 * The language the app opens in, from all three sources at once.
 *
 * Order: `?lang=` preview, then the traveller's setting, then the device. The
 * preview beats the setting on purpose — it exists so translation work can be
 * reviewed, and a reviewer whose own preference overrode it is the one person
 * who could not see the thing they are reviewing.
 */
export const resolveStartingLanguage = ({
  preview,
  device,
}: {
  preview?: string | null;
  device?: string | null;
}): SupportedLanguage => {
  if (preview) return resolveLanguage(preview);
  return loadLanguagePreference() ?? (device ? resolveLanguage(device) : FALLBACK_LANGUAGE);
};
