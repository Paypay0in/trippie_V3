import React from 'react';
import { CalendarDays, CircleDollarSign, Plane, ReceiptText } from 'lucide-react';

export type WalletPhase = 'pre' | 'during' | 'return' | 'summary';

interface Props {
  currentPhase: WalletPhase;
  onChange: (phase: WalletPhase) => void;
}

const phases: Array<{ id: WalletPhase; label: string; Icon: React.ElementType }> = [
  { id: 'pre', label: '旅行前', Icon: CalendarDays },
  { id: 'during', label: '旅行中', Icon: Plane },
  { id: 'return', label: '返程', Icon: ReceiptText },
  { id: 'summary', label: '結算', Icon: CircleDollarSign },
];

const WalletPhaseSelector: React.FC<Props> = ({ currentPhase, onChange }) => (
  <div className="flex w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
    {phases.map(phase => (
      <button
        key={phase.id}
        type="button"
        onClick={() => onChange(phase.id)}
        className={`relative flex min-h-[4.25rem] flex-1 flex-col items-center justify-center gap-1 px-1 text-[13px] font-black transition-colors ${currentPhase === phase.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'}`}
      >
        <phase.Icon size={18} strokeWidth={currentPhase === phase.id ? 2.5 : 2} />
        {phase.label}
        {currentPhase === phase.id && <span className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-gradient-to-r from-blue-600 to-violet-600" />}
      </button>
    ))}
  </div>
);

export default WalletPhaseSelector;
