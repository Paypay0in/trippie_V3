
import React, { useState, useEffect, useRef } from 'react';
import { Trip } from '../types';
import { Calendar, Trash2, Edit3, Check } from 'lucide-react';

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
        className="group relative w-full aspect-[3/4] cursor-pointer perspective-1000"
      >
        <div className="absolute inset-0 bg-gray-100 rounded-r-xl rounded-l-md border-2 border-dashed border-gray-300 flex flex-col items-center justify-center transition-transform duration-300 group-hover:-translate-y-2 shadow-sm hover:shadow-md hover:border-brand-400 hover:bg-brand-50">
           <div className="w-12 h-12 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center mb-3 group-hover:border-brand-400 group-hover:text-brand-500 text-gray-400 transition-colors">
              <Edit3 size={24} />
           </div>
           <span className="font-bold text-gray-500 group-hover:text-brand-600">開啟新旅程</span>
        </div>
      </div>
    );
  }

  // 2. Render Actual Book (Draft or Archived)
  const coverColor = isDraft ? 'bg-white border-2 border-brand-500' : getColor(trip!.id);
  const totalCost = isDraft ? draftTotal : trip!.totalCost;
  const count = isDraft ? draftExpenseCount : trip!.expenses.length;
  const dateStr = getDateDisplay();

  return (
    <div 
        onClick={onClick}
        className="group relative w-full aspect-[3/4] cursor-pointer perspective-1000"
    >
        {/* Book Spine (Left side shadow/depth) */}
        <div className="absolute left-0 top-1 bottom-1 w-4 bg-gray-900/20 rounded-l-sm z-0 transform translate-x-1 translate-y-1"></div>
        
        {/* Main Cover */}
        <div className={`absolute inset-0 rounded-r-xl rounded-l-md shadow-md transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-black/20 overflow-hidden flex flex-col ${coverColor} ${isDraft ? 'text-gray-800' : 'text-white'}`}>
            
            {/* Spine Highlight */}
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-black/10 border-r border-white/10"></div>
            
            {/* Content Container */}
            <div className="flex-1 p-4 pl-8 flex flex-col relative z-10">
                
                {/* Header / Badge & Actions */}
                <div className="flex justify-between items-start mb-2">
                    {isDraft ? (
                        <span className="bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand-200">
                            進行中
                        </span>
                    ) : (
                         <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md">
                            已封存
                        </span>
                    )}
                    
                    <div className="flex gap-1">
                        {onRename && !isEditing && (
                            <button 
                                onClick={handleEditClick}
                                className={`p-1.5 rounded transition-colors ${isDraft ? 'hover:bg-gray-100 text-gray-400' : 'bg-black/10 hover:bg-black/20 text-white/80 hover:text-white'}`}
                            >
                                <Edit3 size={14} />
                            </button>
                        )}
                        {!isDraft && onDelete && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                                className="p-1.5 rounded bg-black/10 hover:bg-black/20 text-white/80 hover:text-white transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Title */}
                {isEditing ? (
                    <div className="mb-auto" onClick={handleInputClick}>
                        <textarea
                            ref={inputRef as any}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-white/90 text-gray-900 p-1 rounded text-lg font-bold outline-none resize-none shadow-inner"
                            rows={3}
                            maxLength={30}
                        />
                        <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1">
                            <Check size={10} /> Enter 儲存
                        </div>
                    </div>
                ) : (
                    <h3 className={`font-bold text-lg leading-tight mb-auto line-clamp-3 ${isDraft ? 'text-gray-800' : 'text-white drop-shadow-sm'}`}>
                        {displayTitle}
                    </h3>
                )}

                {/* Metadata */}
                <div className={`space-y-1 text-xs ${isDraft ? 'text-gray-500' : 'text-white/80'}`}>
                    <div className="flex items-center gap-1.5">
                        <Calendar size={12} />
                        <span className="font-medium">{dateStr}</span>
                    </div>
                    {/* Decorative Line */}
                    <div className={`h-px w-full my-2 ${isDraft ? 'bg-gray-200' : 'bg-white/30'}`}></div>
                    
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-[10px] opacity-70">總花費</div>
                            <div className={`font-mono font-bold text-lg ${isDraft ? 'text-brand-600' : 'text-white'}`}>
                                ${Math.round(totalCost || 0).toLocaleString()}
                            </div>
                        </div>
                        <div className={`px-2 py-1 rounded text-[10px] font-bold ${isDraft ? 'bg-gray-100 text-gray-600' : 'bg-black/20 text-white'}`}>
                            {count} 筆
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Texture Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-white/10 pointer-events-none"></div>
        </div>
    </div>
  );
};

export default TripBook;
