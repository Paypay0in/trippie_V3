import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppWordmark from './AppWordmark';
import { ArrowLeft, CalendarDays, ChevronRight, FileText, Mail, Users, WalletCards } from 'lucide-react';
import { fetchDestinationImage } from '../services/destinationImageService';

interface Props {
  onBack: () => void;
  onEmail: () => void;
  onUnavailableProvider: () => void;
}

/*
  Keys rather than strings: this table is built once at import, so a `t()` call
  here would freeze whichever language happened to be active at that moment.
  The label is resolved where it renders.
*/
const benefits = [
  { titleKey: 'auth.landing.benefitPlanTitle', descriptionKey: 'auth.landing.benefitPlanDetail', icon: CalendarDays },
  { titleKey: 'auth.landing.benefitRecordTitle', descriptionKey: 'auth.landing.benefitRecordDetail', icon: FileText },
  { titleKey: 'auth.landing.benefitCommunityTitle', descriptionKey: 'auth.landing.benefitCommunityDetail', icon: Users },
  { titleKey: 'auth.landing.benefitBudgetTitle', descriptionKey: 'auth.landing.benefitBudgetDetail', icon: WalletCards },
];

const AuthLandingScreen: React.FC<Props> = ({ onBack, onEmail, onUnavailableProvider }) => {
  const { t } = useTranslation();
  const [heroImage, setHeroImage] = useState<string>();

  useEffect(() => {
    let active = true;
    // i18n-data: search term sent to the image provider, not copy on screen
    fetchDestinationImage('Santorini').then(image => {
      if (active && image?.imageUrl) setHeroImage(image.imageUrl);
    });
    return () => { active = false; };
  }, []);

  /*
    The same miss as the sign-in screen beside it: no data-safe-top, a 20px
    top, and a back button inside the strip the clock owns.
  */
  return (
    <main data-safe-top style={{ ["--safe-top-base" as string]: "var(--header-top)" }} className="relative min-h-screen overflow-hidden bg-white px-[var(--screen-pad)] pb-8 text-[#11183d] md:mx-auto md:max-w-2xl">
      <div className="pointer-events-none absolute right-0 top-0 h-[330px] w-[72%] overflow-hidden rounded-bl-[100px]">
        {heroImage && <img src={heroImage} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-white" />
      </div>

      <button type="button" onClick={onBack} aria-label={t('auth.back')} className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#11183d] shadow-sm">
        <ArrowLeft size={20} />
      </button>

      <section className="relative z-10 max-w-[290px] pt-8">
        {/*
          The last one outside the system, now inside it.

          「統一」. This was a gradient display treatment at 32px — defensible as
          a hero rather than a header, which is why it was left and asked
          about. But it is still the app's name, and the rule he set is that
          the name is one thing: 社群, 旅行, 我的, 旅程書架 and 登入 all draw it
          from one component, and a sixth size on the screen somebody meets
          first is the one that sets their expectation for the other five.
        */}
        <AppWordmark />
        <p className="mt-7 text-sm font-bold text-violet-600">{t('trips.greeting')}</p>
        <h1 className="mt-2 text-[32px] font-black leading-[1.12] tracking-[-0.04em]">{t('auth.landing.headlineLineOne')}<br />{t('auth.landing.headlineLineTwo')}</h1>
        <p className="mt-4 text-[14px] font-medium leading-6 text-slate-500">{t('auth.landing.blurbLineOne')}<br />{t('auth.landing.blurbLineTwo')}</p>
      </section>

      <section className="relative z-10 mt-[92px] grid grid-cols-4 gap-2">
        {benefits.map(({ titleKey, descriptionKey, icon: Icon }) => (
          <div key={titleKey} className="text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-600"><Icon size={20} strokeWidth={2.2} /></div>
            <p className="mt-2 text-[11px] font-black leading-4">{t(titleKey)}</p>
            <p className="mt-1 text-[9px] leading-3 text-slate-400">{t(descriptionKey)}</p>
          </div>
        ))}
      </section>

      <section className="relative z-10 mt-8">
        <button type="button" onClick={onEmail} className="flex h-14 w-full items-center justify-between rounded-[18px] bg-gradient-to-r from-[#7139d8] to-[#9366f2] px-5 text-left font-black text-white shadow-[0_10px_24px_rgba(113,57,216,0.25)]">
          <span className="flex items-center gap-3"><Mail size={21} />{t('auth.landing.emailCta')}</span>
          <ChevronRight size={21} />
        </button>
        <div className="my-6 flex items-center gap-3 text-[11px] font-bold text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t('auth.landing.otherMethods')}<span className="h-px flex-1 bg-slate-200" /></div>
        <div className="grid grid-cols-3 gap-3">
          {/* i18n-data: provider brand names, the same in every language */}
          {['Google', 'Apple', 'LINE'].map(provider => <button key={provider} type="button" onClick={onUnavailableProvider} className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-400 shadow-sm">{provider}</button>)}
        </div>
        <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">{t('auth.landing.termsPrefix')}<br /><span className="font-bold text-violet-500">{t('auth.landing.termsOfService')}</span>{' '}{t('auth.landing.termsConjunction')}{' '}<span className="font-bold text-violet-500">{t('auth.landing.privacyPolicy')}</span></p>
      </section>
    </main>
  );
};

export default AuthLandingScreen;
