import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phase } from '../types';
import { PHASES } from '../constants';

interface Props {
  currentPhase: Phase;
  onChange: (phase: Phase) => void;
}

const PhaseSelector: React.FC<Props> = ({ currentPhase, onChange }) => {
  const { t } = useTranslation();
  const phaseMeta: Record<Phase, { title: string; subtitle: string }> = {
    pre: { title: 'PLAN', subtitle: t('phase.selector.pre') },
    during: { title: 'TRIP', subtitle: t('phase.selector.during') },
    post: { title: 'RETURN', subtitle: t('phase.selector.post') },
    summary: { title: 'RECAP', subtitle: t('phase.selector.summary') },
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
