
import React, { useRef, useState } from 'react';
import { Trip } from '../types';
import TripBook from './TripBook';
import { Trophy, Search, Camera, Image as ImageIcon, Loader2, Sparkles, MapPin, Plus, Check, ShoppingBag, ArrowRight, X, CheckCircle } from 'lucide-react';
import { fetchShoppingSuggestions } from '../services/geminiService';

interface Props {
  currentDraftExpenses: any[]; 
  draftName: string;
  draftStartDate?: string;
  draftEndDate?: string;
  tripHistory: Trip[];
  onOpenDraft: () => void;
  onOpenTrip: (trip: Trip) => void;
  onCreateNew: () => void;
  onDeleteTrip: (id: string) => void;
  onRenameTrip: (id: string | null, newName: string) => void;
  onSmartScan: (files: FileList) => Promise<void>; 
  onBatchAddShoppingItems: (items: string[], targetTripId: string | 'new' | 'draft', newTripName?: string, detectedCountry?: string) => void; 
}

const TripSelectionScreen: React.FC<Props> = ({ 
  currentDraftExpenses, 
  draftName,
  draftStartDate,
  draftEndDate,
  tripHistory, 
  onOpenDraft, 
  onOpenTrip, 
  onCreateNew, 
  onDeleteTrip,
  onRenameTrip,
  onSmartScan,
  onBatchAddShoppingItems
}) => {
  const hasDraft = currentDraftExpenses.length > 0;
  const draftTotal = currentDraftExpenses.reduce((sum, e) => sum + e.twdAmount, 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{current: number, total: number} | null>(null);

  // AI Planning State
  const [tripDescription, setTripDescription] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{item: string, reason: string, selected: boolean}>>([]);
  const [plannedCountry, setPlannedCountry] = useState<string>(''); // Store detected country
  
  // Target Selection Modal State
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
          setIsScanning(true);
          setScanProgress({ current: 0, total: files.length });
          try {
            await onSmartScan(files);
          } finally {
            setIsScanning(false);
            setScanProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
      }
  };

  const handleGetSuggestions = async () => {
      if (!tripDescription.trim()) return;
      setIsPlanning(true);
      setSuggestions([]); // Clear previous
      setPlannedCountry('');
      try {
          const { suggestions: items, country } = await fetchShoppingSuggestions(tripDescription);
          setSuggestions(items.map(i => ({ ...i, selected: false })));
          if (country) setPlannedCountry(country);
      } finally {
          setIsPlanning(false);
      }
  };

  const toggleSelection = (index: number) => {
      const newSuggestions = [...suggestions];
      newSuggestions[index].selected = !newSuggestions[index].selected;
      setSuggestions(newSuggestions);
  };

  const selectedCount = suggestions.filter(s => s.selected).length;

  const handleConfirmAddToTrip = (targetId: string | 'new' | 'draft') => {
      const itemsToAdd = suggestions.filter(s => s.selected).map(s => s.item);
      // If creating new, use the description as the default name
      const potentialName = targetId === 'new' ? (tripDescription + ' 之旅') : undefined;
      
      // Pass the detected country if creating a new trip
      onBatchAddShoppingItems(itemsToAdd, targetId, potentialName, targetId === 'new' ? plannedCountry : undefined);
      
      // Reset UI
      setIsTargetModalOpen(false);
      setSuggestions([]);
      setTripDescription('');
      setPlannedCountry('');
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center py-10 px-4 relative overflow-y-auto">
        {/* Background Texture */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>

        {/* Loading Overlay */}
        {isScanning && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white animate-fade-in">
                <Loader2 size={48} className="animate-spin mb-4 text-brand-400" />
                <h3 className="text-xl font-bold mb-2">
                    {scanProgress && scanProgress.total > 1 
                        ? '正在批次處理單據...' 
                        : '正在分析單據...'}
                </h3>
                <p className="text-white/70 text-sm">
                   AI 正在識別日期與金額，並為您歸檔
                   {scanProgress && scanProgress.total > 1 && (
                       <span className="block mt-2 text-brand-300 font-mono text-lg">
                           請稍候...
                       </span>
                   )}
                </p>
            </div>
        )}

        {/* Header */}
        <div className="w-full max-w-4xl mb-8 z-10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
                <h1 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tight flex items-center justify-center md:justify-start gap-3">
                    <span className="text-4xl md:text-5xl">✈️</span> Trippie 旅行管家
                </h1>
                <p className="text-gray-500 mt-2 font-medium text-sm md:text-base">收藏您的每一段精彩旅程與回憶</p>
            </div>
            
            {/* Stats Badge */}
            <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
                <div className="text-center">
                    <div className="text-[10px] md:text-xs text-gray-400 font-bold uppercase">總旅程數</div>
                    <div className="font-black text-lg md:text-xl text-gray-700">{tripHistory.length + (hasDraft ? 1 : 0)}</div>
                </div>
                <div className="w-px h-8 bg-gray-200"></div>
                <div className="text-center">
                    <div className="text-[10px] md:text-xs text-gray-400 font-bold uppercase">封存總額</div>
                    <div className="font-black text-lg md:text-xl text-brand-600">
                        ${Math.round(tripHistory.reduce((acc, t) => acc + t.totalCost, 0)).toLocaleString()}
                    </div>
                </div>
            </div>
        </div>

        {/* AI TRIP PLANNER SECTION */}
        <div className="w-full max-w-4xl z-10 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-1 overflow-hidden transition-all duration-300">
                <div className="p-4 md:p-6 bg-gradient-to-r from-purple-50 to-white">
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Sparkles className="text-purple-500" size={20} /> AI 旅程行前規劃
                            </h2>
                            <p className="text-xs text-gray-500 mt-1">
                                告訴我您的目的地與計畫（例如：去冰島看極光自駕遊），我將為您推薦必備的採買清單。
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 relative">
                        <div className="relative flex-1">
                            <MapPin className="absolute left-3 top-3 text-gray-400" size={18} />
                            <input 
                                type="text" 
                                value={tripDescription}
                                onChange={(e) => setTripDescription(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleGetSuggestions()}
                                placeholder="輸入您的旅程計畫... (例如: 冬天去北海道滑雪、泰國曼谷自由行)"
                                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none shadow-inner text-gray-700"
                            />
                        </div>
                        <button 
                            onClick={handleGetSuggestions}
                            disabled={isPlanning || !tripDescription.trim()}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shrink-0"
                        >
                            {isPlanning ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                            <span className="hidden md:inline">產生建議</span>
                        </button>
                    </div>

                    {/* NEW: Action Bar for Selection (Inline) */}
                    {selectedCount > 0 && (
                        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
                            <div className="text-purple-800 font-bold text-sm flex items-center gap-2">
                                <div className="bg-purple-100 p-1 rounded-full"><CheckCircle size={16} className="text-purple-600" /></div>
                                <span>已選擇 <span className="text-lg">{selectedCount}</span> 個建議項目</span>
                            </div>
                            <button 
                                onClick={() => setIsTargetModalOpen(true)}
                                className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-200 hover:shadow-lg hover:-translate-y-0.5"
                            >
                                <ShoppingBag size={16} className="text-purple-300" />
                                下一步：加入帳本 <ArrowRight size={14} />
                            </button>
                        </div>
                    )}

                    {/* Suggestions Grid */}
                    {suggestions.length > 0 && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fade-in-up pb-4">
                            {suggestions.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => toggleSelection(idx)}
                                    className={`p-3 rounded-xl border transition-all flex justify-between items-center gap-3 cursor-pointer select-none group ${
                                        item.selected 
                                            ? 'bg-purple-600 border-purple-600 shadow-md transform scale-[1.02]' 
                                            : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm ${item.selected ? 'text-white' : 'text-gray-800'}`}>
                                            {item.item}
                                        </div>
                                        <div className={`text-[10px] line-clamp-2 leading-tight mt-0.5 ${item.selected ? 'text-purple-100' : 'text-gray-500'}`}>
                                            {item.reason}
                                        </div>
                                    </div>
                                    <div 
                                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                            item.selected 
                                                ? 'bg-white text-purple-600 border-white' 
                                                : 'bg-gray-100 text-gray-300 border-gray-200 group-hover:border-purple-200'
                                        }`}
                                    >
                                        {item.selected ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* TARGET SELECTION MODAL */}
        {isTargetModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <ShoppingBag className="text-purple-600" size={20} /> 選擇目標帳本
                        </h2>
                        <button onClick={() => setIsTargetModalOpen(false)} className="p-1 hover:bg-gray-200 rounded-full">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>
                    
                    <div className="p-5 space-y-3">
                        <p className="text-sm text-gray-500 mb-2">
                            請問您要將這 <span className="font-bold text-purple-600">{selectedCount}</span> 個待買項目加入哪裡？
                        </p>

                        {/* Option 1: Create New (Top Priority) */}
                        <button 
                            onClick={() => handleConfirmAddToTrip('new')}
                            className="w-full text-left p-4 rounded-xl border-2 border-dashed border-purple-200 hover:border-purple-500 hover:bg-purple-50 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 bg-purple-100 text-purple-600 text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                                推薦
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 text-purple-600 p-2 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                    <Plus size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-800 group-hover:text-purple-700">建立新旅程並加入</div>
                                    <div className="text-xs text-gray-400">
                                        將命名為「{tripDescription || '新旅程'}」
                                        {plannedCountry && <span className="block text-purple-600 font-bold mt-0.5">✨ 自動設定國家：{plannedCountry}</span>}
                                    </div>
                                </div>
                            </div>
                        </button>

                        <div className="relative py-2">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">或是加入現有帳本</span></div>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                            {/* Option 2: Current Draft */}
                            {hasDraft && (
                                <button 
                                    onClick={() => handleConfirmAddToTrip('draft')}
                                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-all flex items-center gap-3"
                                >
                                    <div className="bg-brand-100 text-brand-600 p-2 rounded-lg">
                                        <Trophy size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-800 truncate">{draftName || '未命名草稿'}</div>
                                        <div className="text-xs text-gray-500">正在進行中的旅程</div>
                                    </div>
                                </button>
                            )}

                            {/* Option 3: History */}
                            {tripHistory.map(trip => (
                                <button 
                                    key={trip.id}
                                    onClick={() => handleConfirmAddToTrip(trip.id)}
                                    className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center gap-3"
                                >
                                    <div className="bg-gray-100 text-gray-500 p-2 rounded-lg">
                                        <Check size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-800 truncate">{trip.name}</div>
                                        <div className="text-xs text-gray-400">已封存</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SMART ACTION AREA */}
        <div className="w-full max-w-4xl z-10 mb-10">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                multiple // Enabled multiple file selection
                onChange={handleFileChange}
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white p-1 rounded-2xl shadow-lg shadow-indigo-200 transition-all group transform hover:scale-[1.01]"
            >
                <div className="bg-white/10 border border-white/20 rounded-xl p-4 md:p-6 flex flex-col md:flex-row items-center justify-between backdrop-blur-sm gap-4">
                    <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                        <div className="bg-white text-indigo-600 p-3 md:p-4 rounded-full shadow-inner">
                            <Camera size={28} className="md:w-8 md:h-8" />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-bold flex flex-col md:flex-row items-center gap-2">
                                📸 智慧識別 / 批次匯入
                                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-normal border border-white/30 flex items-center gap-1">
                                    <Sparkles size={10} /> 支援多張圖片
                                </span>
                            </h2>
                            <p className="text-indigo-100 text-xs md:text-sm opacity-90 mt-1">
                                一次選擇多張收據、機票或截圖，AI 自動辨識並歸入對應旅程。
                            </p>
                        </div>
                    </div>
                    <div className="bg-white/20 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                         <ImageIcon size={24} />
                    </div>
                </div>
            </button>
        </div>

        {/* Bookshelf Grid */}
        <div className="w-full max-w-4xl z-10">
            {/* Shelf Level 1 - Active & New */}
            <div className="mb-12">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-8 bg-brand-500 rounded-full"></div>
                    <h2 className="text-xl font-bold text-gray-700">準備出發</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                    <TripBook onClick={onCreateNew} />
                    {hasDraft && (
                        <TripBook 
                            isDraft
                            draftName={draftName}
                            draftExpenseCount={currentDraftExpenses.length}
                            draftTotal={draftTotal}
                            startDate={draftStartDate}
                            endDate={draftEndDate}
                            onClick={onOpenDraft} 
                            onRename={(name) => onRenameTrip(null, name)}
                        />
                    )}
                </div>
            </div>

            {/* Shelf Level 2 - History */}
            {tripHistory.length > 0 && (
                 <div>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-8 bg-gray-400 rounded-full"></div>
                        <h2 className="text-xl font-bold text-gray-700">回憶錄</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                        {tripHistory.map(trip => (
                            <TripBook 
                                key={trip.id} 
                                trip={trip} 
                                onClick={() => onOpenTrip(trip)}
                                onDelete={() => onDeleteTrip(trip.id)}
                                onRename={(name) => onRenameTrip(trip.id, name)}
                            />
                        ))}
                    </div>
                </div>
            )}
            
            {tripHistory.length === 0 && !hasDraft && (
                <div className="text-center py-20 opacity-50">
                    <Trophy size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-400">書架上空空的，快開始第一趟旅程吧！</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default TripSelectionScreen;
