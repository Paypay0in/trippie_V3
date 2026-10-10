import React from 'react';
import { Compass, Map, Plus, BriefcaseBusiness, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type AppSection = 'community' | 'trips' | 'services' | 'profile';

/**
 * The room a page has to leave under itself for the floating bar.
 *
 * 「這頁跑版」. When the bar was welded to the bottom edge its top sat about
 * 52px up and pb-24 cleared it. Floating moved three things at once: the bar
 * now starts a safe-area inset above the edge, and the raised + button stands
 * 24px proud of the bar itself. On a phone with a home indicator the highest
 * pixel of the nav is around 110px up, and pb-24 is 96 — so the last card of
 * every list sat under it, unreachable by scrolling.
 *
 * Expressed once, here, beside the bar whose size it depends on. A page that
 * hard-codes its own number is a page that will not hear about the next change
 * to this one.
 */
export const BOTTOM_NAV_CLEARANCE = 'pb-[calc(env(safe-area-inset-bottom)+6.5rem)]';

interface Props {
  active: AppSection;
  onChange: (section: AppSection) => void;
  onPlus: () => void;
}

const AppBottomNav: React.FC<Props> = ({ active, onChange, onPlus }) => {
  const { t } = useTranslation();
  /*
    Floating, not welded to the edge.

    「可以做成這樣漂浮的導覽列」. A bar flush with the bottom of a phone shares its
    edge with the home indicator and reads as part of the chrome; lifted off it,
    with the page visible underneath, it reads as part of the app. The inset is
    still the safe area — it has become the gap the bar floats in rather than
    padding inside it.
  */
  return (
    <nav className="fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100%-1.5rem)] -translate-x-1/2 items-end justify-around rounded-[1.9rem] border border-slate-200/70 bg-white/90 px-3 pb-2.5 pt-2 shadow-[0_14px_40px_rgba(30,41,90,.16)] backdrop-blur-2xl md:max-w-2xl lg:max-w-2xl">
      <button onClick={() => onChange('community')} className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'community' ? 'text-violet-600' : 'text-slate-400'}`}><Compass size={20} />{t('nav.community')}</button>
      <button onClick={() => onChange('trips')} className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'trips' ? 'text-violet-600' : 'text-slate-400'}`}><Map size={20} />{t('nav.trips')}</button>
      <button onClick={onPlus} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/30" aria-label={t('nav.addAriaLabel')}><Plus size={28} /></button>
      <button onClick={() => onChange('services')} className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'services' ? 'text-violet-600' : 'text-slate-400'}`}><BriefcaseBusiness size={20} />{t('nav.services')}</button>
      <button onClick={() => onChange('profile')} className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'profile' ? 'text-violet-600' : 'text-slate-400'}`}><UserRound size={20} />{t('nav.profile')}</button>
    </nav>
  );
};

export default AppBottomNav;
