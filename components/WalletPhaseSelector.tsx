import React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CircleDollarSign, Plane, ReceiptText } from 'lucide-react';

export type WalletPhase = 'pre' | 'during' | 'return' | 'summary';

interface Props {
  currentPhase: WalletPhase;
  onChange: (phase: WalletPhase) => void;
}

/*
  The tab's own id and the key its name lives under are not the same word.

  This selector calls the third stage `return`, while the bundles — and the
  stored `Expense.phase` every other screen reads — call it `post`. The id is
  what callers pass in and what the wallet switches on, so it stays; only the
  lookup knows about the difference.
*/
const phases: Array<{ id: WalletPhase; labelKey: string; Icon: React.ElementType }> = [
  { id: 'pre', labelKey: 'phase.pre', Icon: CalendarDays },
  { id: 'during', labelKey: 'phase.during', Icon: Plane },
  { id: 'return', labelKey: 'phase.post', Icon: ReceiptText },
  { id: 'summary', labelKey: 'phase.summary', Icon: CircleDollarSign },
];

const WalletPhaseSelector: React.FC<Props> = ({ currentPhase, onChange }) => {
  const { t } = useTranslation();
  return (
  <div className="flex w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
    {phases.map(phase => (
      <button
        key={phase.id}
        type="button"
        onClick={() => onChange(phase.id)}
        className={`relative flex min-h-[4.25rem] flex-1 flex-col items-center justify-center gap-1 px-1 text-[13px] font-black transition-colors ${currentPhase === phase.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'}`}
      >
        <phase.Icon size={18} strokeWidth={currentPhase === phase.id ? 2.5 : 2} />
        {t(phase.labelKey)}
        {currentPhase === phase.id && <span className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-gradient-to-r from-blue-600 to-violet-600" />}
      </button>
    ))}
  </div>
  );
};

export default WalletPhaseSelector;
