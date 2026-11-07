/**
 * 旅途安心 / Travel SOS — T1.
 *
 * Board: Q1=A (default to the trip's destination country, explicit manual
 * override, always say which place the numbers apply to), Q2=B (all eight
 * blocks are V1 scope), SPLIT=A (seven tickets; this is the first).
 *
 * What T1 renders: the place row with 變更地點, the emergency-number block,
 * and the five blocks that are not built yet.
 *
 * Those five are rendered as plainly inert rows, not as tappable rows that do
 * nothing. The Board's own note on Q2 says it: never mark a menu complete
 * unless it works. A chevron that does not navigate is a promise the screen
 * cannot keep, and this is the screen where a broken promise matters most.
 *
 * The numbers themselves come from `emergencyNumbers`, which owns the single
 * rule about what may be dialled. This file never inspects `status` — one rule,
 * one home; a second copy here is a second answer, and the day they disagree
 * somebody dials something nobody verified.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Building2,
  FileText,
  Languages,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { countryDisplayName } from '../services/countryIdentity';
import {
  EmergencyNumber,
  dialableNumbers,
  unavailableReason,
} from '../services/emergencyNumbers';

interface Props {
  /** The trip's destination country, as the trip wrote it. May be absent. */
  country?: string;
  /**
   * Shown beside the country, when it says something the country does not.
   *
   * A trip to 日本 whose destination is also 日本 would otherwise read
   * 「日本・日本」, which is the app repeating itself at the worst moment.
   */
  city?: string;
  onBack: () => void;
  /** Opens the place picker. Q1=A: the traveller may always switch. */
  onChangePlace: () => void;
}

/** The blocks T1 does not build. Named here so the screen can be honest. */
const PENDING_BLOCKS: { key: string; icon: React.ElementType }[] = [
  { key: 'consulate', icon: Building2 },
  { key: 'nearby', icon: MapPin },
  { key: 'phrases', icon: Languages },
  { key: 'shareLocation', icon: Users },
  { key: 'documents', icon: FileText },
  { key: 'offline', icon: WifiOff },
];

const TravelSosScreen: React.FC<Props> = ({ country, city, onBack, onChangePlace }) => {
  const { t } = useTranslation();
  const numbers = dialableNumbers(country);
  const reason = unavailableReason(country);

  const purposeLabel = (entry: EmergencyNumber) => t(`sos.purpose.${entry.purpose}`);

  return (
    <main className="min-h-screen bg-[#f7f8fc] pb-16 text-[#11183d] md:mx-auto md:max-w-2xl">
      <header data-safe-top className="bg-white px-[var(--screen-pad)] pb-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-sm font-black text-violet-600"
        >
          <ArrowLeft size={17} />{t('common.back')}
        </button>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black">
          <ShieldCheck size={22} className="text-violet-600" />{t('sos.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('sos.intro')}</p>
      </header>

      {/*
        Which place these numbers are for, said out loud.

        Q1=A requires both halves: the default follows the trip, and the screen
        states the place it is answering about. A screen that quietly assumed a
        country would be at its most confident exactly when it was wrong.
      */}
      <section className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400">{t('sos.currentPlaceLabel')}</p>
          <p data-testid="sos-place" className="truncate text-base font-black">
            {country
              ? [countryDisplayName(country), city?.trim()]
                  .filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index)
                  .join('・')
              : t('sos.placeUnknown')}
          </p>
        </div>
        <button
          type="button"
          data-testid="sos-change-place"
          onClick={onChangePlace}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-2 text-xs font-black text-violet-700"
        >
          {t('sos.changePlace')}
        </button>
      </section>

      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-black text-rose-600">
          <Phone size={16} />{t('sos.emergencyNumbersTitle')}
        </h2>

        {numbers.length > 0 ? (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {numbers.map(entry => (
              <li key={`${entry.purpose}-${entry.number}`}>
                {/*
                  The first dialable link in this product. It exists only for a
                  row the dataset published, and the dataset publishes only what
                  two independent issuing bodies agreed on.
                */}
                <a
                  data-testid={`sos-dial-${entry.purpose}`}
                  href={`tel:${entry.number}`}
                  className="flex min-h-20 flex-col items-center justify-center rounded-2xl bg-rose-50 px-2 py-3 text-center"
                >
                  <span className="text-2xl font-black text-rose-600">{entry.number}</span>
                  <span className="mt-0.5 text-[11px] font-bold text-slate-600">{purposeLabel(entry)}</span>
                </a>
                {/*
                  A local short code may not route from a foreign SIM. Shown
                  only where an official source stated the international form —
                  never inferred, because an inferred dialling prefix is a wrong
                  number with extra steps.
                */}
                {entry.internationalNumber && (
                  <p className="mt-1 text-center text-[10px] text-slate-400">
                    {t('sos.fromAbroad', { number: entry.internationalNumber })}
                  </p>
                )}
                <p className="mt-0.5 text-center text-[10px] text-slate-400">
                  {t('sos.checkedAt', { date: entry.checkedAt })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          /*
            Said, not left blank.

            An empty slot reads as a loading state or as a bug; a traveller
            needs to know the app holds nothing for them so they can look
            elsewhere immediately, which in an emergency is the whole value of
            the sentence.
          */
          <p data-testid="sos-numbers-unavailable" className="mt-3 rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-500">
            {t(`sos.unavailable.${reason ?? 'no_data'}`)}
          </p>
        )}
      </section>

      {/*
        The rest of 旅途安心, named and visibly not built.

        Rendering them as rows with chevrons would be a menu that does not work.
        Rendering nothing would hide the scope the Founder approved. So they are
        listed, dimmed, inert, each labelled 尚未提供.
      */}
      <section className="mx-4 mt-4 space-y-2">
        {PENDING_BLOCKS.map(({ key, icon: Icon }) => (
          <div
            key={key}
            data-testid={`sos-pending-${key}`}
            className="flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-slate-400 shadow-sm"
          >
            <Icon size={18} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{t(`sos.blocks.${key}.title`)}</p>
              <p className="truncate text-[11px]">{t(`sos.blocks.${key}.subtitle`)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">
              {t('sos.notYetAvailable')}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
};

export default TravelSosScreen;
