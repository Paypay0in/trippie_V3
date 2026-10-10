import React, { useEffect, useState } from 'react';
import StaleBuildBanner from './StaleBuildBanner';
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
import {
  DestinationImage,
  fetchDestinationImage,
} from '../services/destinationImageService';

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
  const [image, setImage] = useState<DestinationImage | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setImage(null);
    setImageFailed(false);
    if (!destination.trim()) return () => { active = false; };
    fetchDestinationImage(destination).then(result => {
      if (active) setImage(result);
    });
    return () => { active = false; };
  }, [destination]);

  const actionClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-500 shadow-sm transition-colors hover:text-blue-600';

  return (
    <div className="min-h-screen w-full bg-[#f6f7fc] pb-24 text-[#11183d]">
      {/*
        Mounted here, where every trip screen passes through.

        「我為什麼打開還是依樣」. The banner lived on one screen, and that screen
        stopped being rendered — so the one thing that can tell a phone it is
        running yesterday's build showed up nowhere. The workspace is the frame
        around every stage of a trip, which makes it the one place worth saying
        it from.
      */}
      <StaleBuildBanner />
      <header className="mx-auto w-full max-w-2xl bg-white px-4 pb-3 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button className={actionClass} onClick={onBack} aria-label="回到旅程首頁"><ArrowLeft size={21} /></button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-lg font-black">
            <span className="shrink-0 text-violet-600">✈</span>
            <span className="truncate">{currentSection === 'records' ? 'Trippie 旅費管理' : 'Trippie'}</span>
          </div>
          {/* Hidden on phones, where five 44px targets and a title do not fit a
              320px row: they overlapped the title instead of wrapping. Every
              one of them is in 「更多」 at the bottom, which is within thumb
              reach anyway — so this is a duplicate, not the only way in. */}
          <div className="hidden shrink-0 gap-1.5 sm:flex">
            <button className={actionClass} onClick={onEdit} aria-label="編輯旅程"><Pencil size={18} /></button>
            <button className={actionClass} onClick={onDestination} aria-label="目的地設定"><Globe size={18} /></button>
            <button className={`${actionClass} relative`} onClick={onTravelers} aria-label="旅伴管理">
              <Users size={18} />
              {companionCount > 0 && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />}
            </button>
            <button className={actionClass} onClick={onShare} aria-label="分享旅程"><Share2 size={18} /></button>
          </div>
        </div>

        <div className="relative min-h-48 overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700">
          {image && !imageFailed && (
            <img
              className="absolute inset-0 h-full w-full object-cover"
              src={image.imageUrl}
              alt={`${image.destinationQuery} destination scenery`}
              onError={() => setImageFailed(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#101638]/90 via-[#101638]/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <div className="mb-1 truncate text-3xl font-black tracking-tight">{tripName || destination || '我的旅程'}</div>
            {dateRange && <div className="text-sm font-semibold text-white/90">{dateRange}</div>}
            {currentSection !== 'records' && <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-indigo-700 backdrop-blur">
              <span className={`h-2 w-2 rounded-full ${currentPhase === 'during' ? 'bg-emerald-500' : 'bg-violet-500'}`} />
              {currentSection === 'records' ? '旅費管理' : currentPhase === 'during' ? 'TRIP 旅行中' : currentPhase === 'pre' ? 'PLAN 旅行前' : currentPhase === 'post' ? 'RETURN 返程中' : 'RECAP 回顧紀錄'}
            </div>}
          </div>
          {image && !imageFailed && image.attributionRequired && (
            <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[9px] text-white backdrop-blur">
              Photo by <a className="underline" href={image.photographerUrl} target="_blank" rel="noreferrer">{image.photographer}</a> on <a className="underline" href={image.sourceUrl} target="_blank" rel="noreferrer">Pexels</a>
            </div>
          )}
        </div>
        {/* No phase tabs on the overview. The trip has dates, so asking the
            traveller to pick 行前/旅行中/返程 is asking them to tell the app
            something it already knows; the ledger keeps its own tabs because
            there you really do go back and forth between stages. */}
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-4">{children}</main>

      <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 items-end justify-around border-t border-slate-200 bg-white/95 px-3 pb-[max(.65rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(30,41,90,.08)] backdrop-blur-xl">
        <button onClick={() => onSectionChange('overview')} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${currentSection === 'overview' ? 'text-blue-600' : 'text-slate-400'}`}><BookOpenText size={20} />總覽</button>
        <button onClick={() => onSectionChange('planning')} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${currentSection === 'planning' ? 'text-blue-600' : 'text-slate-400'}`}><ListChecks size={20} />規劃</button>
        <button onClick={onQuickAdd} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/30" aria-label="新增記錄"><Plus size={28} /></button>
        <button onClick={() => onSectionChange('records')} className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${currentSection === 'records' ? 'text-blue-600' : 'text-slate-400'}`}><BookOpenText size={20} />記帳</button>
        <div className="relative">
          {moreOpen && (
            <div className="absolute bottom-16 right-0 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {[[Pencil, '編輯旅程', onEdit], [Globe, '目的地設定', onDestination], [Users, '旅伴管理', onTravelers], [Share2, '分享旅程', onShare]].map(([Icon, label, handler]) => (
                <button key={label as string} onClick={() => { (handler as () => void)(); setMoreOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">
                  {React.createElement(Icon as React.ElementType, { size: 17 })}{label as string}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setMoreOpen(value => !value)} className="relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400">
            {moreOpen ? <ChevronUp size={20} /> : <MoreHorizontal size={20} />}更多
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
