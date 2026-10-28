import type { SupportedLanguage } from '../i18n/config';

/**
 * What language the AI answers in.
 *
 * 「看使用者輸入什麼語言 就用該語言回」 — the traveller's own words decide. Not
 * the interface setting, and not the language the product happens to be
 * written in: somebody who types a question in English is telling us what they
 * read, more reliably than any setting.
 *
 * One sentence, one place. Nine prompts carried their own 「請用繁體中文」 before
 * this, which is nine chances for one of them to keep answering in Chinese
 * after the others stopped — the shape of defect this codebase produces over
 * and over, this time in prose rather than code.
 *
 * The fallback matters as much as the rule. A travel-rules lookup is a
 * destination and a passport country code; there is no prose to mirror. The
 * language the app is being read in is then the only honest guess, so the
 * caller passes it and the model is told plainly rather than left to pick.
 */

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  'zh-Hant': 'Traditional Chinese',
  en: 'English',
};

/**
 * Proper names stay as they are, in every language.
 *
 * 「Visit Japan Web」 is what is printed on the sign at the airport. A traveller
 * in that queue needs the string they will actually see, so these are the one
 * thing the rule exempts — the same exemption the old Chinese-only instruction
 * already made for them, kept rather than lost in the move.
 */
const PROPER_NAME_EXEMPTION =
  'Keep the proper names of official systems, forms and services exactly as they are written officially (for example Visit Japan Web, ESTA, K-ETA), in any language, because the traveller has to recognise them on the spot. Place names, brand names and product names also keep their own spelling.';

export const outputLanguageRule = ({
  hasUserText,
  interfaceLanguage = 'zh-Hant',
}: {
  /** Whether the prompt contains words the traveller wrote themselves. */
  hasUserText: boolean;
  interfaceLanguage?: SupportedLanguage;
}): string => {
  const named = LANGUAGE_NAMES[interfaceLanguage] ?? LANGUAGE_NAMES['zh-Hant'];

  const instruction = hasUserText
    ? `Write everything the traveller will read in the same language the traveller wrote in. If their own words are in more than one language, follow the one most of their text is in; if they wrote nothing you can judge, use ${named}.`
    : `Write everything the traveller will read in ${named}. When a source is in another language, translate it rather than quoting it.`;

  return `${instruction} ${PROPER_NAME_EXEMPTION}`;
};
