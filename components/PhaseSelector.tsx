import React from 'react';
import { Phase } from '../types';
import { PHASES } from '../constants';

interface Props {
  currentPhase: Phase;
  onChange: (phase: Phase) => void;
}

const PhaseSelector: React.FC<Props> = ({ currentPhase, onChange }) => {
  return (
    <div className="relative bg-gray-100/50 p-1 rounded-2xl flex w-full mb-8 border border-gray-200/50 backdrop-blur-sm">
      {PHASES.map((phase) => {
        const isActive = currentPhase === phase.id;
        return (
          <button
            key={phase.id}
            onClick={() => onChange(phase.id)}
            className={`relative flex-1 py-3 px-2 flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-300 group ${
              isActive 
                ? 'bg-white shadow-sm text-brand-600' 
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className={`text-[10px] font-black uppercase tracking-widest transition-opacity ${isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}>
              {phase.id}
            </span>
            <span className={`text-sm font-bold ${isActive ? 'text-gray-900' : ''}`}>
              {phase.label}
            </span>
            {isActive && (
              <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${phase.color.replace('bg-', 'bg-')}`} />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PhaseSelector;
