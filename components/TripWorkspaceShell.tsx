import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookOpenText,
  ChevronUp,
  Globe,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  Users,
} from 'lucide-react';
import { Phase } from '../types';
import { BOTTOM_NAV_CLEARANCE } from './AppBottomNav';
import AppWordmark from './AppWordmark';
import TripCover from './TripCover';

export type WorkspaceSection = 'overview' | 'planning' | 'records';

interface Props {
  children: React.ReactNode;
  tripName: string;
  dateRange: string;
  destination: string;
  currentPhase: Phase;
  currentSection: WorkspaceSection;
  companionCount: number;
  onBack: () => void;
  onEdit: () => void;
  onDestination: () => void;
  onTravelers: () => void;
  onShare: () => void;
  onSectionChange: (section: WorkspaceSection) => void;
  onQuickAdd: () => void;
}

const TripWorkspaceShell: React.FC<Props> = ({
  children,
  tripName,
  dateRange,
  destination,
  currentPhase,
  currentSection,
  companionCount,
  onBack,
  onEdit,
  onDestination,
  onTravelers,
  onShare,
  onSectionChange,
  onQuickAdd,
}) => {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  /*
    The picture is found with the words printed on top of it.

    「這不是沖繩」 — a trip titled 日本沖繩 wearing the torii gates of 伏見稲荷,
    which are in Kyoto. The header has always shown `tripName || destination`
    and searched `destination` alone, two fields nothing keeps in agreement,
    so the photo was answering a question the traveller could not see.

    Checked against the live endpoint: 「日本」 returns that exact photograph,
    credited to the same photographer on the screenshot, while 「日本沖繩」
    returns Okinawa. The search was never the problem; what it was given was.

    This is still a stock photo and still decorative — nothing here can
    confirm the beach it returns is the right beach. What it can do is stop
    the picture disagreeing with the title above it.
  */
  const imageQuery = (tripName || destination || '').trim();


  const actionClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition-colors hover:text-blue-600';

  return (
    <div className={`min-h-screen w-full bg-[#f6f7fc] text-[#11183d] ${BOTTOM_NAV_CLEARANCE}`}>
      <header data-safe-top className="mx-auto w-full max-w-2xl bg-white px-4 pb-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button className={actionClass} onClick={onBack} aria-label={t('workspace.backAria')}><ArrowLeft size={21} /></button>
          {/*
            The seventh copy.

            「統一」 was answered an hour ago with 「six screens, no exceptions」.
            That was wrong: the check looked at a list I had written rather than
            at the codebase, and this header — 18px, its own plane, the name
            glued to a section label — was not on it. A rule enforced over a
            hand-kept list is not enforced.

            旅費管理 becomes a label beside the name rather than part of it. It
            is what you are looking at, not what the app is called.
          */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AppWordmark />
            {currentSection === 'records' && (
              <span className="truncate text-meta font-bold text-ink-soft">{t('workspace.ledgerLabel')}</span>
            )}
          </div>
          {/* Hidden on phones, where five 44px targets and a title do not fit a
              320px row: they overlapped the title instead of wrapping. Every
              one of them is in 「更多」 at the bottom, which is within thumb
              reach anyway — so this is a duplicate, not the only way in. */}
          <div className="hidden shrink-0 gap-1.5 sm:flex">
            <button className={actionClass} onClick={onEdit} aria-label={t('app.trip.edit')}><Pencil size={18} /></button>
            <button className={actionClass} onClick={onDestination} aria-label={t('workspace.destinationSettings')}><Globe size={18} /></button>
            <button className={`${actionClass} relative`} onClick={onTravelers} aria-label={t('app.trip.manageCompanions')}>
              <Users size={18} />
              {companionCount > 0 && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />}
            </button>
            <button className={actionClass} onClick={onShare} aria-label={t('trips.shareTrip')}><Share2 size={18} /></button>
          </div>
        </div>

        <TripCover query={imageQuery} dateRange={dateRange}>
          {currentSection !== 'records' && <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-indigo-700 backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${currentPhase === 'during' ? 'bg-emerald-500' : 'bg-violet-500'}`} />
            {currentPhase === 'during' ? t('workspace.phaseDuring') : currentPhase === 'pre' ? t('workspace.phasePre') : currentPhase === 'post' ? t('workspace.phasePost') : t('workspace.phaseRecap')}
          </div>}
        </TripCover>
        {/* No phase tabs on the overview. The trip has dates, so asking the
            traveller to pick 行前/旅行中/返程 is asking them to tell the app
            something it already knows; the ledger keeps its own tabs because
            there you really do go back and forth between stages. */}
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-4">{children}</main>

            {/* Floating, for the same reason as the app bar. See AppBottomNav. */}
      <nav className="fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 items-end justify-around rounded-[1.9rem] border border-slate-200/70 bg-white/90 px-3 pb-2.5 pt-2 shadow-[0_14px_40px_rgba(30,41,90,.16)] backdrop-blur-2xl">
        <button onClick={() => onSectionChange('overview')} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${currentSection === 'overview' ? 'text-blue-600' : 'text-slate-400'}`}><BookOpenText size={20} />{t('workspace.navOverview')}</button>
        <button onClick={() => onSectionChange('planning')} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${currentSection === 'planning' ? 'text-blue-600' : 'text-slate-400'}`}><ListChecks size={20} />{t('workspace.navPlanning')}</button>
        <button onClick={onQuickAdd} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/30" aria-label={t('workspace.quickAddAria')}><Plus size={28} /></button>
        <button onClick={() => onSectionChange('records')} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${currentSection === 'records' ? 'text-blue-600' : 'text-slate-400'}`}><BookOpenText size={20} />{t('workspace.navRecords')}</button>
        <div className="relative">
          {moreOpen && (
            <div className="absolute bottom-16 right-0 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {[[Pencil, 'app.trip.edit', onEdit], [Globe, 'workspace.destinationSettings', onDestination], [Users, 'app.trip.manageCompanions', onTravelers], [Share2, 'trips.shareTrip', onShare]].map(([Icon, labelKey, handler]) => (
                <button key={labelKey as string} onClick={() => { (handler as () => void)(); setMoreOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">
                  {React.createElement(Icon as React.ElementType, { size: 17 })}{t(labelKey as string)}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setMoreOpen(value => !value)} className="relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400">
            {moreOpen ? <ChevronUp size={20} /> : <MoreHorizontal size={20} />}{t('common.more')}
            {/* The companion marker lived on the header's 旅伴 button, which is
                not on screen at phone width. Without this it would simply
                vanish on the devices this trip is actually run from. */}
            {companionCount > 0 && !moreOpen && (
              <span className="absolute right-2.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />
            )}
          </button>
        </div>
      </nav>
    </div>
  );
};

export default TripWorkspaceShell;
