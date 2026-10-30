import React from 'react';
import { Check, Globe, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import i18n, { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/config';
import {
  clearLanguagePreference,
  loadLanguagePreference,
  resolveStartingLanguage,
  saveLanguagePreference,
} from '../services/languagePreference';

/**
 * The language setting, under 「我」.
 *
 * 「介面的語言隨著手機語言調整，但在「我」的欄位應該要有「設定」可以改」. Three rows,
 * because the honest answer has three options and not two: follow the phone,
 * English, Chinese. 「Follow my phone」 is a real choice distinct from picking
 * the language the phone happens to report today — somebody who picks it keeps
 * following the phone when they change the phone.
 *
 * Each row carries two names: the language's name in the language you are
 * reading right now, and the language's own name underneath it.
 *
 * 「翻英文」 — on an English screen a row reading 繁體中文 and nothing else is
 * the one line a reader of English cannot parse, so the name they can read
 * leads. But the endonym cannot simply be replaced by it: the person who most
 * needs this screen is the one who has landed in a language they do not read,
 * and 繁體中文 is the only thing on it they can recognise. Dropping it would
 * close the exit for exactly the reader it was built for. Both, then — one
 * legible now, one legible when everything else has stopped being.
 */

/** What each option is called in the language being read. Translated. */
const LANGUAGE_NAME_KEYS: Record<SupportedLanguage, string> = {
  'zh-Hant': 'language.name.zhHant',
  en: 'language.name.en',
  ja: 'language.name.ja',
};

/** What each option calls itself. Never translated. */
// i18n-data: endonyms. Each option names itself so a traveller stranded in the
// wrong language can still read the row that gets them out.
const LANGUAGE_ENDONYMS: Record<SupportedLanguage, string> = {
  'zh-Hant': '繁體中文', // i18n-data: endonym — a language names itself so a stranded traveller can read it
  en: 'English',
  ja: '日本語', // i18n-data: endonym — a language names itself so a stranded traveller can read it
};

interface Props {
  /** Told after a change, so a host screen can close its menu. */
  onChanged?: (language: SupportedLanguage) => void;
}

const LanguageSetting: React.FC<Props> = ({ onChanged }) => {
  const { t } = useTranslation();
  const [preference, setPreference] = React.useState<SupportedLanguage | undefined>(() =>
    loadLanguagePreference(),
  );

  const apply = (next: SupportedLanguage | undefined) => {
    if (next) saveLanguagePreference(next);
    else clearLanguagePreference();
    setPreference(next);

    /*
      Resolved rather than assumed. Clearing the preference means 「follow my
      phone」, and the language that follows from that is the phone's — asking
      the same function startup asks keeps the two from disagreeing.
    */
    const effective = resolveStartingLanguage({
      device:
        typeof navigator === 'undefined'
          ? undefined
          : navigator.language || navigator.languages?.[0],
    });
    void i18n.changeLanguage(effective);
    onChanged?.(effective);
  };

  const rows: Array<{
    key: string;
    label: string;
    /** The language's own name, shown only when it differs from the label. */
    endonym?: string;
    icon: React.ReactNode;
    value?: SupportedLanguage;
  }> = [
    {
      key: 'device',
      label: t('language.followDevice'),
      icon: <Smartphone size={16} className="text-slate-400" />,
      value: undefined,
    },
    ...SUPPORTED_LANGUAGES.map(language => {
      const label = t(LANGUAGE_NAME_KEYS[language]);
      const endonym = LANGUAGE_ENDONYMS[language];
      return {
        key: language,
        label,
        // English read in English says "English" twice otherwise.
        endonym: endonym === label ? undefined : endonym,
        icon: <Globe size={16} className="text-slate-400" />,
        value: language as SupportedLanguage,
      };
    }),
  ];

  return (
    <section data-testid="language-setting" className="overflow-hidden rounded-card border border-hairline bg-white">
      <h2 className="border-b border-hairline px-4 py-3 text-support font-semibold text-ink-soft">
        {t('language.title')}
      </h2>
      {rows.map(row => {
        const selected = row.value === preference;
        return (
          <button
            key={row.key}
            type="button"
            data-testid={`language-option-${row.key}`}
            aria-pressed={selected}
            onClick={() => apply(row.value)}
            className="flex w-full items-center gap-2.5 border-b border-hairline px-4 py-3 text-left text-field font-semibold last:border-b-0"
          >
            {row.icon}
            <span className="flex-1">
              {row.label}
              {row.endonym && (
                <span className="ml-1.5 font-medium text-slate-400">{row.endonym}</span>
              )}
            </span>
            {selected && <Check size={16} className="text-violet-600" aria-hidden />}
          </button>
        );
      })}
    </section>
  );
};

export default LanguageSetting;
