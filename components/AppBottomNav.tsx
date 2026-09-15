import React from 'react';
import { Compass, Map, Plus, BriefcaseBusiness, UserRound } from 'lucide-react';

export type AppSection = 'community' | 'trips' | 'services' | 'profile';

interface Props {
  active: AppSection;
  onChange: (section: AppSection) => void;
  onPlus: () => void;
}

const AppBottomNav: React.FC<Props> = ({ active, onChange, onPlus }) => (
  <nav className="fixed bottom-0 left-1/2 z-50 flex w-full -translate-x-1/2 items-end justify-around border-t border-slate-200 bg-white/95 px-4 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_30px_rgba(30,41,90,.08)] backdrop-blur-xl md:max-w-2xl lg:max-w-2xl">
    <button onClick={() => onChange('community')} className={`flex min-h-10 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'community' ? 'text-violet-600' : 'text-slate-400'}`}><Compass size={20} />社群</button>
    <button onClick={() => onChange('trips')} className={`flex min-h-10 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'trips' ? 'text-violet-600' : 'text-slate-400'}`}><Map size={20} />旅行</button>
    <button onClick={onPlus} className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/30" aria-label="新增旅程或記錄"><Plus size={28} /></button>
    <button onClick={() => onChange('services')} className={`flex min-h-10 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'services' ? 'text-violet-600' : 'text-slate-400'}`}><BriefcaseBusiness size={20} />服務</button>
    <button onClick={() => onChange('profile')} className={`flex min-h-10 min-w-14 flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${active === 'profile' ? 'text-violet-600' : 'text-slate-400'}`}><UserRound size={20} />我</button>
  </nav>
);

export default AppBottomNav;
