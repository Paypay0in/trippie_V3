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
 * Each language is named in itself. A traveller who has landed in the wrong
 * language cannot read a list written in that wrong language, which is exactly
 * when they need this screen.
 */

/** What each option says, in its own language. Never translated. */
const LANGUAGE_ENDONYMS: Record<SupportedLanguage, string> = {
  'zh-Hant': '繁體中文',
  en: 'English',
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

  const rows: Array<{ key: string; label: string; icon: React.ReactNode; value?: SupportedLanguage }> = [
    {
      key: 'device',
      label: t('language.followDevice'),
      icon: <Smartphone size={16} className="text-slate-400" />,
      value: undefined,
    },
    ...SUPPORTED_LANGUAGES.map(language => ({
      key: language,
      label: LANGUAGE_ENDONYMS[language],
      icon: <Globe size={16} className="text-slate-400" />,
      value: language as SupportedLanguage,
    })),
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
            <span className="flex-1">{row.label}</span>
            {selected && <Check size={16} className="text-violet-600" aria-hidden />}
          </button>
        );
      })}
    </section>
  );
};

export default LanguageSetting;
