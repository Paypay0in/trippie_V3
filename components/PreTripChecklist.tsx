
import React from 'react';
import { Category, Expense } from '../types';
import { PRE_TRIP_SUGGESTIONS } from '../constants';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  onQuickAddCategory: (category: Category) => void;
  expenses: Expense[];
}

const PreTripChecklist: React.FC<Props> = ({ onQuickAddCategory, expenses }) => {
  
  const isCategoryCompleted = (category: Category) => {
    return expenses.some(e => e.phase === 'pre' && e.category === category);
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
        <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2 mb-3">
            ✨ 行前準備項目
        </h3>
        <div className="grid grid-cols-3 gap-2">
            {PRE_TRIP_SUGGESTIONS.map((item) => {
            const Icon = item.icon;
            const isDone = isCategoryCompleted(item.category);
            
            return (
                <button
                key={item.category}
                onClick={() => onQuickAddCategory(item.category)}
                className={`relative flex flex-col items-center justify-center p-2 rounded-lg border text-xs transition-all duration-300 group ${
                    isDone 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' 
                        : 'border-dashed border-gray-300 text-gray-400 hover:border-brand-300 hover:text-brand-500 hover:bg-brand-50'
                }`}
                >
                {isDone && (
                    <div className="absolute top-1 right-1 text-emerald-500">
                        <CheckCircle2 size={14} className="fill-emerald-100" />
                    </div>
                )}
                <Icon size={18} className={`mb-1 ${isDone ? 'text-emerald-600' : ''}`} />
                <span className={isDone ? 'font-bold' : ''}>{item.label}</span>
                </button>
            );
            })}
        </div>
    </div>
  );
};

export default PreTripChecklist;
