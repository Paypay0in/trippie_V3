
import React, { useState, useEffect, useRef } from 'react';
import { Trip } from '../types';
import { Calendar, Trash2, Edit3, Check, Plus } from 'lucide-react';

interface Props {
  trip?: Trip; // If undefined, it acts as a "New Trip" placeholder
  isDraft?: boolean;
  draftName?: string;
  draftExpenseCount?: number;
  draftTotal?: number;
  startDate?: string; // Explicit start date for draft
  endDate?: string;   // Explicit end date for draft
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onRename?: (newName: string) => void;
}

const COVER_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-green-600',
  'bg-teal-600',
  'bg-blue-600',
  'bg-indigo-600',
  'bg-violet-600',
  'bg-pink-600',
  'bg-rose-600',
];

const TripBook: React.FC<Props> = ({ 
  trip, 
  isDraft, 
  draftName, 
  draftExpenseCount, 
  draftTotal,
  startDate,
  endDate, 
  onClick, 
  onDelete,
  onRename 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate a consistent color based on trip ID or name
  const getColor = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COVER_COLORS.length;
    return COVER_COLORS[index];
  };

  const displayTitle = isDraft ? (draftName || '未命名旅程') : trip?.name;

  useEffect(() => {
    if (isEditing) {
        setEditValue(displayTitle || '');
        // Small delay to focus after render
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isEditing, displayTitle]);

  const handleSave = () => {
      if (editValue.trim() && onRename) {
          onRename(editValue.trim());
      }
      setIsEditing(false);
  };

  const handleEditClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
  };

  const handleInputClick = (e: React.MouseEvent) => {
      e.stopPropagation();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          handleSave();
      }
  };

  // Helper to format date range
  const getDateDisplay = () => {
      let s = isDraft ? (startDate || new Date().toISOString()) : trip?.startDate;
      let e = isDraft ? (endDate || new Date().toISOString()) : trip?.endDate;
      
      // Fallback
      if (!s) s = new Date().toISOString();
      if (!e) e = s;

      const d1 = s.split('T')[0].replace(/-/g, '/');
      const d2 = e.split('T')[0].replace(/-/g, '/');

      if (d1 === d2) return d1;

      // Check year
      const y1 = d1.substring(0, 4);
      const y2 = d2.substring(0, 4);

      if (y1 === y2) {
          return `${d1} - ${d2.substring(5)}`; // 2024/01/01 - 01/05
      }
      return `${d1} - ${d2}`; // Cross year
  };

  // 1. Render "New Trip" Placeholder
  if (!trip && !isDraft) {
    return (
      <div 
        onClick={onClick}
        className="group relative w-full aspect-[2/1] cursor-pointer"
      >
        <div className="absolute inset-0 bg-white rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center transition-all duration-300 group-hover:border-brand-400 group-hover:bg-brand-50 group-hover:shadow-md">
           <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mb-2 group-hover:bg-white group-hover:scale-110 transition-all text-gray-400 group-hover:text-brand-500">
              <Plus size={24} />
           </div>
           <span className="font-bold text-gray-400 group-hover:text-brand-600 text-sm">開啟新旅程</span>
        </div>
      </div>
    );
  }

  // 2. Render Actual Book (Draft or Archived)
  const coverColor = isDraft ? 'bg-white border border-brand-100' : getColor(trip!.id);
  const totalCost = isDraft ? draftTotal : trip!.totalCost;
  const count = isDraft ? draftExpenseCount : trip!.expenses.length;
  const dateStr = getDateDisplay();

  return (
    <div 
        onClick={onClick}
        className="group relative w-full aspect-[2/1] cursor-pointer"
    >
        {/* Main Cover Card */}
        <div className={`absolute inset-0 rounded-2xl shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/10 overflow-hidden flex ${coverColor} ${isDraft ? 'text-gray-800' : 'text-white'}`}>
            
            {/* Book Spine Metaphor (Left accent) */}
            <div className={`w-3 h-full ${isDraft ? 'bg-brand-500' : 'bg-black/20'} shrink-0`}></div>
            
            {/* Content Container */}
            <div className="flex-1 p-5 flex flex-col relative z-10">
                
                {/* Header / Badge & Actions */}
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                        {isDraft ? (
                            <span className="bg-brand-50 text-brand-600 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider border border-brand-100">
                                Draft
                            </span>
                        ) : (
                             <span className="bg-white/20 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider backdrop-blur-md">
                                Archived
                            </span>
                        )}
                        <div className="flex items-center gap-1 text-[10px] opacity-60 font-bold">
                            <Calendar size={10} />
                            {dateStr}
                        </div>
                    </div>
                    
                    <div className="flex gap-1">
                        {onRename && !isEditing && (
                            <button 
                                onClick={handleEditClick}
                                className={`p-1.5 rounded-lg transition-colors ${isDraft ? 'hover:bg-gray-100 text-gray-400' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
                            >
                                <Edit3 size={14} />
                            </button>
                        )}
                        {!isDraft && onDelete && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Title Section */}
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="mb-auto" onClick={handleInputClick}>
                            <input
                                ref={inputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleSave}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-white/90 text-gray-900 px-2 py-1 rounded-lg text-lg font-bold outline-none shadow-inner"
                                maxLength={30}
                            />
                        </div>
                    ) : (
                        <h3 className={`font-black text-xl leading-tight mb-1 truncate ${isDraft ? 'text-gray-900' : 'text-white'}`}>
                            {displayTitle}
                        </h3>
                    )}
                    
                    {/* Subtitle / Location Placeholder */}
                    <p className={`text-xs font-medium opacity-60 truncate ${isDraft ? 'text-gray-500' : 'text-white'}`}>
                        {count} 筆消費記錄 • {isDraft ? '編輯中' : '已結算'}
                    </p>
                </div>

                {/* Footer / Stats */}
                <div className="mt-auto pt-4 flex items-end justify-between border-t border-white/10">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 block mb-0.5">Total Cost</span>
                        <div className={`font-mono font-black text-2xl ${isDraft ? 'text-brand-600' : 'text-white'}`}>
                            ${Math.round(totalCost || 0).toLocaleString()}
                            <span className="text-xs ml-1 opacity-60">TWD</span>
                        </div>
                    </div>
                    
                    {/* Decorative Element */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDraft ? 'bg-brand-50 text-brand-500' : 'bg-white/10 text-white'}`}>
                        <Edit3 size={18} className="opacity-40" />
                    </div>
                </div>
            </div>
            
            {/* Texture Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/5 pointer-events-none"></div>
        </div>
    </div>
  );
};

export default TripBook;
