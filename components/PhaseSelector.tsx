import React from 'react';
import { Phase } from '../types';
import { PHASES } from '../constants';

interface Props {
  currentPhase: Phase;
  onChange: (phase: Phase) => void;
}

const PhaseSelector: React.FC<Props> = ({ currentPhase, onChange }) => {
  const phaseMeta: Record<Phase, { title: string; subtitle: string }> = {
    pre: { title: 'PLAN', subtitle: '旅行前' },
    during: { title: 'TRIP', subtitle: '旅行中' },
    post: { title: 'RETURN', subtitle: '返程中' },
    summary: { title: 'RECAP', subtitle: '回顧紀錄' },
  };
  return (
    <div className="relative -mt-1 flex w-full overflow-hidden rounded-b-[1.35rem] border border-slate-100 bg-white shadow-lg shadow-slate-900/5">
      {PHASES.map((phase) => {
        const isActive = currentPhase === phase.id;
        return (
          <button
            key={phase.id}
            onClick={() => onChange(phase.id)}
            className={`group relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 py-3 transition-all duration-300 ${
              isActive 
                ? 'text-violet-600'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="text-xs font-black tracking-wide">
              {phaseMeta[phase.id].title}
            </span>
            <span className={`text-[10px] font-bold ${isActive ? 'text-violet-700' : ''}`}>
              {phaseMeta[phase.id].subtitle}
            </span>
            {isActive && (
              <div className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-blue-600 to-violet-600" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PhaseSelector;
