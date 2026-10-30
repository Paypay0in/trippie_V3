import React from 'react';
import { useTranslation } from 'react-i18next';
import { Category, Expense } from '../types';
import { POST_TRIP_SUGGESTIONS } from '../constants';
import { categoryLabel } from '../services/categoryDisplay';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  onQuickAddCategory: (category: Category) => void;
  expenses: Expense[];
}

const PostTripChecklist: React.FC<Props> = ({ onQuickAddCategory, expenses }) => {
  const { t, i18n } = useTranslation();
  /*
    The suggestion's label is a lookup on the stored value, not a translation
    key: `Category.COSMETICS` IS the 美妝保養 written to localStorage and
    Supabase. `categoryDisplay` stays the one home for it, so this only tells it
    which language to answer in.
  */
  const displayLocale = i18n.language?.startsWith('en') ? 'en' : 'zh-Hant';

  const isCategoryCompleted = (category: Category) => {
    return expenses.some(e => e.phase === 'post' && e.category === category);
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
        <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2 mb-3">
            {t('wallet.dutyFreeCategories')}
        </h3>
        <div className="grid grid-cols-3 gap-2">
            {POST_TRIP_SUGGESTIONS.map((item) => {
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
                <span className={`text-[10px] md:text-xs ${isDone ? 'font-bold' : ''}`}>{categoryLabel(item.category, displayLocale)}</span>
                </button>
            );
            })}
        </div>
    </div>
  );
};

export default PostTripChecklist;