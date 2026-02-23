import React from 'react';
import { Phase } from '../types';
import { PHASES } from '../constants';

interface Props {
  currentPhase: Phase;
  onChange: (phase: Phase) => void;
}

const PhaseSelector: React.FC<Props> = ({ currentPhase, onChange }) => {
  return (
    <div className="flex w-full bg-white rounded-xl shadow-sm p-1 mb-6">
      {PHASES.map((phase) => (
        <button
          key={phase.id}
          onClick={() => onChange(phase.id)}
          className={`flex-1 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
            currentPhase === phase.id
              ? `${phase.color} text-white shadow-md`
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          {phase.label}
        </button>
      ))}
    </div>
  );
};

export default PhaseSelector;
